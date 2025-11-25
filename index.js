// index.js
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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

app.listen(process.env.PORT || 3000, ()=> console.log('API up'));
