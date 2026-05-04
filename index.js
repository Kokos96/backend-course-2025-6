const { program } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');

program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії з кешем');

program.parse();
const options = program.opts();

if (!fs.existsSync(options.cache)) {
  fs.mkdirSync(options.cache, { recursive: true });
}

const app = express();
const upload = multer({ dest: options.cache }); 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let inventoryData = [];
let currentId = 1;

const methodNotAllowed = (req, res) => res.status(405).send('Method Not Allowed');

app.route('/register')
  .post(upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) {
      return res.status(400).send('Bad Request: inventory_name is required');
    }
    const newItem = {
      id: currentId.toString(),
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      photo: req.file ? req.file.filename : null
    };
    inventoryData.push(newItem);
    currentId++;
    res.status(201).json(newItem);
  })
  .all(methodNotAllowed);

app.route('/inventory')
  .get((req, res) => res.status(200).json(inventoryData))
  .all(methodNotAllowed);

app.route('/inventory/:id')
  .get((req, res) => {
    const item = inventoryData.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    res.status(200).json(item);
  })
  .put((req, res) => {
    const item = inventoryData.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    
    if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
    if (req.body.description) item.description = req.body.description;
    
    res.status(200).json(item);
  })
  .delete((req, res) => {
    const index = inventoryData.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).send('Not found');
    
    inventoryData.splice(index, 1);
    res.status(200).send('Deleted successfully');
  })
  .all(methodNotAllowed);

app.route('/inventory/:id/photo')
  .get((req, res) => {
    const item = inventoryData.find(i => i.id === req.params.id);
    if (!item || !item.photo) return res.status(404).send('Not found');
    
    const photoPath = path.join(__dirname, options.cache, item.photo);
    if (fs.existsSync(photoPath)) {
      res.setHeader('Content-Type', 'image/jpeg');
      res.status(200).sendFile(photoPath);
    } else {
      res.status(404).send('Not found');
    }
  })
  .put(upload.single('photo'), (req, res) => {
    const item = inventoryData.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    if (!req.file) return res.status(400).send('No photo uploaded');

    item.photo = req.file.filename;
    res.status(200).send('Photo updated');
  })
  .all(methodNotAllowed);

app.route('/RegisterForm.html')
  .get((req, res) => res.status(200).sendFile(path.join(__dirname, 'RegisterForm.html')))
  .all(methodNotAllowed);

app.route('/SearchForm.html')
  .get((req, res) => res.status(200).sendFile(path.join(__dirname, 'SearchForm.html')))
  .all(methodNotAllowed);

app.route('/search')
  .post((req, res) => {
    const { id, has_photo } = req.body;
    const item = inventoryData.find(i => i.id === id);
    
    if (!item) return res.status(404).send('Not Found');
    
    let result = { ...item };
    if (has_photo === 'on') {
      result.description = `${result.description} (Photo link: /inventory/${item.id}/photo)`;
    }
    res.status(200).json(result);
  })
  .all(methodNotAllowed);

const server = http.createServer(app);

server.listen(options.port, options.host, () => {
  console.log(`Сервер запущено на http://${options.host}:${options.port}`);
});