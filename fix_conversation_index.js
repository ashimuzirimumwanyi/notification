const mysql = require('mysql');
require('dotenv').config();

// Create a connection to the database
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

// Connect to the database
connection.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    return;
  }
  
  console.log('Connected to MySQL database');
  
  // Check existing indexes
  connection.query("SHOW INDEX FROM conversations", (err, results) => {
    if (err) {
      console.error('Error checking indexes:', err);
      connection.end();
      return;
    }
    
    // Find unique indexes
    const uniqueIndexes = results.filter(index => index.Non_unique === 0 && index.Key_name !== 'PRIMARY');
    console.log(`Found ${uniqueIndexes.length} unique indexes on conversations table`);
    
    // Drop all unique indexes
    const dropPromises = [...new Set(uniqueIndexes.map(idx => idx.Key_name))].map(indexName => {
      return new Promise((resolve, reject) => {
        const dropSQL = `DROP INDEX ${indexName} ON conversations`;
        connection.query(dropSQL, (err) => {
          if (err) {
            console.error(`Error dropping index ${indexName}:`, err);
            reject(err);
          } else {
            console.log(`Dropped index ${indexName}`);
            resolve();
          }
        });
      });
    });
    
    Promise.all(dropPromises)
      .then(() => createNewIndex())
      .catch(err => {
        console.error('Error dropping indexes:', err);
        connection.end();
      });
  });
  
  // Create a new unique index that includes listing_id and listing_type
  function createNewIndex() {
    const createIndexSQL = `
      CREATE UNIQUE INDEX unique_conversation_full_idx 
      ON conversations (user_id_1, user_id_2, listing_id, listing_type)
    `;
    
    connection.query(createIndexSQL, (err) => {
      if (err) {
        console.error('Error creating new index:', err);
      } else {
        console.log('Created new unique index that includes listing_id and listing_type');
      }
      
      connection.end();
    });
  }
}); 