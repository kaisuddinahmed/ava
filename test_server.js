const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('ok'));
app.listen(3005, '0.0.0.0', () => console.log('Test server running on 3005'));
