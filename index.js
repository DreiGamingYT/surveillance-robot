// index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({where:{email}});
  // validate password, create JWT...
  res.json({ token: 'jwt-token' });
});

const port = process.env.PORT || 3000;
app.listen(port, ()=> console.log(`API listening on ${port}`));