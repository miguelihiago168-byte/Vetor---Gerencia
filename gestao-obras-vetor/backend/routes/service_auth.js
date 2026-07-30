const express = require('express');
const { serviceAccountAuth } = require('../middleware/serviceAccountAuth');

const router = express.Router();

router.get('/session', serviceAccountAuth, (req, res) => {
  const account = req.serviceAccount;
  return res.json({
    service_account: {
      client_id: account.clientId,
      name: account.name || null
    },
    token: {
      type: 'service_access',
      issued_at: new Date(account.issuedAt * 1000).toISOString(),
      expires_at: new Date(account.expiresAt * 1000).toISOString()
    }
  });
});

module.exports = router;
