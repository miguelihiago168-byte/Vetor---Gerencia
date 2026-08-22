import assert from 'node:assert/strict';
import { buildActivityView, projectDeadline } from './cockpitTransforms.js';

const activities = buildActivityView({
  atividades: [
    { id: 1, percentual_executado: 80 },
    { id: 2, pai_id: 1, percentual_executado: 100, status: 'Concluída' },
    { id: 3, pai_id: 1, percentual_executado: 100, status: 'Concluída' }
  ]
});

assert.equal(activities.total, 2);
assert.equal(activities.counts.completed, 2);

const deadline = projectDeadline(
  { prazo_termino: '2026-08-21' },
  new Date('2026-08-22T12:00:00-03:00'),
  activities.counts.completed === activities.total
);

assert.equal(deadline.completed, true);
assert.equal(deadline.overdue, false);
console.log('cockpit transforms tests passed');
