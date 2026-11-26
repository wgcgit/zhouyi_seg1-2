'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createApp } = require('./app');

const app = createApp();
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`周易之易 v2 服务运行在 http://localhost:${PORT}`);
  });
}

module.exports = { app, start: (p) => app.listen(p || PORT) };
