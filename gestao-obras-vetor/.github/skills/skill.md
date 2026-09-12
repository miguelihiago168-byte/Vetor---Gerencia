---
name: github-pages-deployment
version: 1.0.0
description: "Use quando for publicar ou diagnosticar a publicacao do frontend no GitHub Pages."
tags:
  - deploy
  - github-actions
  - github-pages
---

# GitHub Pages Deployment

## Objetivo

Publicar o frontend estatico pelo GitHub Pages usando o workflow do repositorio.

## Procedimento

1. Validar o frontend com `npm run build` dentro de `frontend/`.
2. Enviar a alteracao para a branch `main`.
3. Acompanhar **GitHub -> Actions -> Deploy para GitHub Pages**.
4. Conferir a URL entregue na etapa **Publicar no GitHub Pages**.

## Observacoes

- O GitHub Pages hospeda apenas arquivos estaticos do frontend.
- Recursos que dependem de API devem apontar para um backend configurado separadamente.
- Em falhas, verifique primeiro as etapas de instalacao, build e upload do artefato.
