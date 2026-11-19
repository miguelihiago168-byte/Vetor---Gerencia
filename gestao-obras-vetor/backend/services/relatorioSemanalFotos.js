const { execFile } = require('node:child_process');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { resolveReportUpload } = require('./relatorioSemanalAssets');

const noActivity = 'Sem vínculo com a EAP';
const groupOf = photo => String(photo.atividade_eap_id ?? 'avulsas');
const selectionOrder = photo => Number.isSafeInteger(photo.ordem_selecao) ? photo.ordem_selecao : Infinity;
const selectedPhotos = photos => photos.filter(photo => photo.selecionada)
  .sort((a, b) => selectionOrder(a) - selectionOrder(b));

function photoFields(row) {
  const name = row.atividade_nome || row.atividade_avulsa_descricao || '';
  return {
    atividade_eap_id: row.atividade_eap_id ?? null, atividade_codigo: row.atividade_codigo || '',
    atividade_nome: name, atividade: [row.atividade_codigo, name].filter(Boolean).join(' — ') || noActivity
  };
}

function restorePhotos(fresh, saved) {
  const current = new Map(fresh.fotos.map(photo => [String(photo.id), photo]));
  for (const old of saved.fotos.filter(photo => photo.selecionada)) {
    const photo = current.get(String(old.id));
    if (!photo) fresh.fotos.push({...old, fonte_ausente: true});
    else if (old.imagem) Object.assign(photo, {
      imagem: old.imagem, tipo_imagem: old.tipo_imagem, imagem_versao: old.imagem_versao
    });
  }
}

class PhotoChoiceError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

// Editable choices carry IDs and captions. All group membership comes from the server.
function applyPhotoChoices(photos, choices) {
  if (!Array.isArray(choices)) throw new PhotoChoiceError('Seleção de fotografias inválida.');
  const catalog = new Map(photos.map(photo => [String(photo.id), photo]));
  const seen = new Set();
  const order = new Map(selectedPhotos(choices.filter(Boolean)).map((photo, index) => [String(photo.id), index + 1]));
  for (const choice of choices) {
    const id = choice?.id;
    const validId = typeof id === 'string' ? /^[1-9]\d*$/.test(id) : Number.isSafeInteger(id) && id > 0;
    if (!validId) {
      throw new PhotoChoiceError('Identificação da fotografia inválida.');
    }
    const key = String(choice.id);
    if (seen.has(key)) throw new PhotoChoiceError('A mesma fotografia foi enviada mais de uma vez.');
    seen.add(key);
    const photo = catalog.get(key);
    if (!photo && choice.selecionada) throw new PhotoChoiceError(
      `A fotografia #${key} saiu das fontes. Revise a seleção antes de continuar.`, 409);
    if (!photo) continue;
    photo.selecionada = choice.selecionada === true;
    photo.ordem_selecao = photo.selecionada ? order.get(key) : null;
    photo.descricao = String(choice.descricao ?? photo.descricao ?? '');
  }
}

function validatePhotoLimits(photos) {
  const counts = new Map();
  for (const photo of photos.filter(photo => photo.selecionada)) {
    const key = groupOf(photo);
    const count = (counts.get(key) || 0) + 1;
    if (count > 2) return `Selecione no máximo duas fotos em “${photo.atividade_eap_id == null ? noActivity : photo.atividade}”.`;
    counts.set(key, count);
  }
  return null;
}

function groupSelectedPhotos(photos) {
  const groups = new Map();
  for (const photo of selectedPhotos(photos)) {
    const key = groupOf(photo);
    if (!groups.has(key)) groups.set(key, { title: photo.atividade_eap_id == null ? noActivity : photo.atividade, photos: [] });
    groups.get(key).photos.push(photo);
  }
  return [...groups.values()];
}

// Force a raster decoder. Never interpret filenames, URLs or arbitrary document formats.
function rasterFormat(data) {
  const head = data.subarray(0, 12).toString('latin1');
  if (data[0] === 255 && data[1] === 216) return 'jpeg';
  if (head.startsWith('\x89PNG\r\n\x1a\n')) return 'png';
  if (head.startsWith('RIFF') && head.slice(8) === 'WEBP') return 'webp';
  if (/^GIF8[79]a/.test(head)) return 'gif';
  if (head.startsWith('BM')) return 'bmp';
  if (/^(II[\x2a\x2b]\x00|MM\x00[\x2a\x2b])/.test(head)) return 'tiff';
  if (head.slice(4, 8) === 'ftyp') return 'heic';
  throw new Error('Formato de imagem inválido ou não reconhecido.');
}

const activeLimit = 2;
let active = 0;
const waiting = [];
async function compactPhoto(source, size = 1440) {
  if (active >= activeLimit) await new Promise(resolve => waiting.push(resolve));
  else active++;
  try {
    let signature = source;
    if (!Buffer.isBuffer(source)) {
      const handle = await fs.open(source, 'r');
      try {
        signature = Buffer.alloc(12);
        await handle.read(signature,0,12,0);
      } finally { await handle.close(); }
    }
    const format = rasterFormat(signature);
    return await new Promise((resolve, reject) => {
      const args = ['-limit','thread','1','-limit','memory','96MiB','-limit','map','192MiB',
        '-limit','disk','256MiB', format + ':-[0]', '-auto-orient','-thumbnail',size+'x'+size+'>',
        '-background','white','-alpha','remove','-alpha','off','-colorspace','sRGB','-strip','-quality','85','jpeg:-'];
      const child = execFile(process.env.REPORT_MAGICK_PATH || 'magick', args,
        {encoding:'buffer', windowsHide:true, timeout:30000, maxBuffer:8*1024*1024},
        (error, result) => error ? reject(new Error('Falha ao converter ' + format + ' (' + (error.code || 'decodificação') + ').')) : resolve(result));
      child.stdin.on('error', () => {}); // The process callback reports early decoder exits.
      if (Buffer.isBuffer(source)) child.stdin.end(source);
      else {
        const input = createReadStream(source);
        input.on('error', error => { child.kill(); reject(error); });
        child.once('close', () => input.destroy());
        input.pipe(child.stdin);
      }
    });
  } finally {
    if (waiting.length) waiting.shift()();
    else active--;
  }
}

function warnPhoto(photo, error) {
  photo.aviso = 'Arquivo indisponível para o PDF.';
  console.warn('[relatório semanal] Foto ' + photo.id + ' do RDO ' + photo.rdo_id + ':', error.message);
}

async function captureImages(snapshot, tenant, project, query) {
  const selected = snapshot.fotos.filter(photo => photo.selecionada);
  const ids = selected.filter(photo => !photo.imagem).map(photo => photo.id);
  const files = ids.length ? await query(`SELECT f.id, f.rdo_id, f.caminho_arquivo
    FROM rdo_fotos f JOIN rdos r ON r.id=f.rdo_id AND (f.tenant_id IS NULL OR f.tenant_id=r.tenant_id)
    WHERE r.tenant_id=? AND r.projeto_id=? AND r.status='Aprovado' AND f.id=ANY(?::bigint[])`, [tenant,project,ids]) : [];
  const byId = new Map(files.map(file => [String(file.id), file]));
  for (const photo of snapshot.fotos) {
    delete photo.aviso;
    if (!photo.selecionada) {
      delete photo.imagem; delete photo.imagem_versao; delete photo.tipo_imagem;
      continue;
    }
    if (photo.imagem && photo.imagem_versao === 1) continue;
    try {
      let source;
      if (photo.imagem) source = Buffer.from(photo.imagem, 'base64');
      else {
        const file = byId.get(String(photo.id));
        const full = file && String(file.rdo_id) === String(photo.rdo_id) && resolveReportUpload(file.caminho_arquivo,tenant);
        if (!full) throw new Error('Arquivo de origem indisponível.');
        source = full;
      }
      photo.imagem = (await compactPhoto(source)).toString('base64');
      photo.tipo_imagem = 'image/jpeg';
      photo.imagem_versao = 1;
    } catch (error) { warnPhoto(photo, error); }
  }
}
module.exports = { photoFields, restorePhotos, applyPhotoChoices, validatePhotoLimits, groupSelectedPhotos,
  compactPhoto, captureImages, PhotoChoiceError, warnPhoto };
