const { program } = require('commander');
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const http = require('http');

// Розбір параметрів командного рядка
program
  .requiredOption('-h, --host <host>', 'адреса сервера')
  .requiredOption('-p, --port <port>', 'порт сервера')
  .requiredOption('-c, --cache <cache>', 'шлях до директорії з кешем');

program.parse();
const options = program.opts();

// Створюємо папку кешу, якщо її немає
if (!fs.existsSync(options.cache)) {
  fs.mkdirSync(options.cache, { recursive: true });
}

// --- НОВИЙ БЛОК: Робота з файлом "бази даних" ---
// Файл буде лежати в папці cache і називатися database.json
const dbFilePath = path.join(options.cache, 'database.json');

// Функція для читання даних з файлу
function readDb() {
  if (!fs.existsSync(dbFilePath)) {
    // Якщо файлу ще немає, повертаємо пусту структуру
    return { currentId: 1, items: [] };
  }
  return JSON.parse(fs.readFileSync(dbFilePath, 'utf8'));
}

// Функція для запису даних у файл
function writeDb(data) {
  fs.writeFileSync(dbFilePath, JSON.stringify(data, null, 2), 'utf8');
}
// -------------------------------------------------

const app = express();
const upload = multer({ dest: options.cache });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const methodNotAllowed = (req, res) => res.status(405).send('Method Not Allowed');

// Реєстрація
app.route('/register')
  .post(upload.single('photo'), (req, res) => {
    if (!req.body.inventory_name) {
      return res.status(400).send('Bad Request: inventory_name is required');
    }
    
    const db = readDb(); // Читаємо актуальну базу
    
    const newItem = {
      id: db.currentId.toString(),
      inventory_name: req.body.inventory_name,
      description: req.body.description || '',
      photo: req.file ? req.file.filename : null
    };
    
    db.items.push(newItem);
    db.currentId++; // Збільшуємо лічильник для наступного запису
    
    writeDb(db); // Зберігаємо зміни у файл
    
    res.status(201).json(newItem);
  })
  .all(methodNotAllowed);

// Отримання всіх пристроїв
app.route('/inventory')
  .get((req, res) => {
    const db = readDb();
    res.status(200).json(db.items);
  })
  .all(methodNotAllowed);

// Робота з конкретним пристроєм (GET, PUT, DELETE)
app.route('/inventory/:id')
  .get((req, res) => {
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    res.status(200).json(item);
  })
  .put((req, res) => {
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    
    if (req.body.inventory_name) item.inventory_name = req.body.inventory_name;
    if (req.body.description) item.description = req.body.description;
    
    writeDb(db); // Зберігаємо оновлені дані
    res.status(200).json(item);
  })
  .delete((req, res) => {
    const db = readDb();
    const index = db.items.findIndex(i => i.id === req.params.id);
    if (index === -1) return res.status(404).send('Not found');
    
    db.items.splice(index, 1);
    writeDb(db); // Зберігаємо базу після видалення
    res.status(200).send('Deleted successfully');
  })
  .all(methodNotAllowed);

// Робота з фото конкретного пристрою
app.route('/inventory/:id/photo')
  .get((req, res) => {
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
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
    const db = readDb();
    const item = db.items.find(i => i.id === req.params.id);
    if (!item) return res.status(404).send('Not found');
    if (!req.file) return res.status(400).send('No photo uploaded');

    item.photo = req.file.filename;
    writeDb(db); // Зберігаємо нове ім'я фотки
    res.status(200).send('Photo updated');
  })
  .all(methodNotAllowed);

// Веб-форми
app.route('/RegisterForm.html')
  .get((req, res) => res.status(200).sendFile(path.join(__dirname, 'RegisterForm.html')))
  .all(methodNotAllowed);

app.route('/SearchForm.html')
  .get((req, res) => res.status(200).sendFile(path.join(__dirname, 'SearchForm.html')))
  .all(methodNotAllowed);

// Пошук
app.route('/search')
  .post((req, res) => {
    const db = readDb();
    const { id, has_photo } = req.body;
    const item = db.items.find(i => i.id === id);
    
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
  console.log(`Директорія кешу: ${options.cache}`);
});