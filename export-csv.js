// Export data from legacy library

const superagent = require('superagent');
const Throttle = require('superagent-throttle')
const csv = require('csvtojson');

if (process.argv.length !== 5) {
  console.log('USAGE:');
  console.log('npm run export-csv -- <API URL> <admin login> <admin password>');
  process.exit(1);
}

const apiUrl = process.argv[2];
const login = process.argv[3];
const password = process.argv[4];

const throttle = new Throttle({
  active: true,
  rate: 2,        // how many requests can be sent every `ratePer`
  ratePer: 100,   // number of ms in which `rate` requests may be sent
  concurrent: 1   // how many requests can be sent concurrently
})

const toNonEmpty = field => field ? field : 'NoInfo';

const toNumber = (field, defaultValue = undefined) => {
  const number = Number(field);
  return number ? number : defaultValue;
};

const deriveTags = row => {
  const wordsArray = [];
  for (let i = 1; i <= 5; i++) {
    wordsArray.push(row[`Word${i}`]);
  }
  return wordsArray.filter(word => word.length);
}

const processData = async () => {
  const authHeader = await superagent
    .post(`${apiUrl}/auth/login`)
    .send({ login, password })
    .then(res => `Bearer ${res.body.token}`)
    .catch(() => {
      console.error('Sign In Error');
      process.exit(1);
    }); 

  const rows = await csv({
    delimiter: '\t'
  }).fromFile('Bazastara.csv');
  
  const books = rows.map(row => ({
    title: toNonEmpty(row['НазваКниги']),
    author: toNonEmpty(row['АвторКниги']),
    publisher: 'NoPublisher',
    publicationYear: toNumber(row['РікВидання'], 0),
    pages: 0,
    classifier: toNonEmpty(row['Класифікатор']),
    description: 'NoDescription',
    notes: row['Примітки'],
    availableOffline: Number(row['КількістьПримірників']) > 0,
    numberOfCopies: toNumber(row['КількістьПримірників']),
    price: toNumber(row['Ціна']),
    tags: deriveTags(row)
    })).filter(book => book.price);

  const uploadBook = book => {
    superagent
      .post(`${apiUrl}/books`)
      .use(throttle.plugin())
      .send(book)
      .set('Authorization', authHeader)
      .then(() => {
        console.log(`Book uploaded: ${JSON.stringify(book)}`)
      })
      .catch(() => {
        console.error(`Failed to upload the book: ${JSON.stringify(book)}`);
        process.exit(1);
      });
  };

  books.forEach(book => uploadBook(book));
};

processData();
