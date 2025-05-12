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
  
  // Update conversations table - add generic listing fields
  updateConversationsTable()
    .then(() => updateMessagesTable())
    .then(() => {
      console.log('All updates completed successfully');
      connection.end();
    })
    .catch(error => {
      console.error('Error during updates:', error);
      connection.end();
    });
});

// Helper function to add a column if it doesn't exist
function addColumnIfNotExists(table, column, dataType) {
  return new Promise((resolve, reject) => {
    connection.query(`SHOW COLUMNS FROM ${table} LIKE '${column}'`, (err, results) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (results.length === 0) {
        connection.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${dataType}`, (err) => {
          if (err) {
            reject(err);
            return;
          }
          console.log(`Added ${column} column to ${table} table`);
          resolve(true); // Column was added
        });
      } else {
        console.log(`Column ${column} already exists in ${table} table`);
        resolve(false); // Column already existed
      }
    });
  });
}

function updateConversationsTable() {
  return new Promise(async (resolve, reject) => {
    try {
      // Add listing_id if it doesn't exist
      const addedListingId = await addColumnIfNotExists('conversations', 'listing_id', 'INT NULL');
      
      // Add listing_type if it doesn't exist
      const addedListingType = await addColumnIfNotExists('conversations', 'listing_type', 'VARCHAR(50) NULL');
      
      // Migrate data only if we added new columns
      if (addedListingId || addedListingType) {
        connection.query('UPDATE conversations SET listing_id = vehicle_id, listing_type = "vehicle" WHERE vehicle_id IS NOT NULL AND listing_id IS NULL', (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log('Migrated vehicle_id data to listing_id in conversations table');
          resolve();
        });
      } else {
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
}

function updateMessagesTable() {
  return new Promise(async (resolve, reject) => {
    try {
      // Add all the new columns if they don't exist
      const addedListingId = await addColumnIfNotExists('messages', 'listing_id', 'INT NULL');
      const addedListingType = await addColumnIfNotExists('messages', 'listing_type', 'VARCHAR(50) NULL');
      const addedListingTitle = await addColumnIfNotExists('messages', 'listing_title', 'VARCHAR(255) NULL');
      const addedListingImage = await addColumnIfNotExists('messages', 'listing_image', 'VARCHAR(255) NULL');
      
      // Migrate data only if we added new columns
      if (addedListingId || addedListingType || addedListingTitle || addedListingImage) {
        connection.query(`
          UPDATE messages 
          SET listing_id = vehicle_id, 
              listing_type = 'vehicle', 
              listing_title = vehicle_title, 
              listing_image = vehicle_image 
          WHERE vehicle_id IS NOT NULL AND listing_id IS NULL
        `, (err) => {
          if (err) {
            reject(err);
            return;
          }
          
          console.log('Migrated vehicle data to listing fields in messages table');
          resolve();
        });
      } else {
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
} 