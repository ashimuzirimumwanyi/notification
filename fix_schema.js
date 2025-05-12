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
  
  // First, describe the conversations table to see its current structure
  connection.query('DESCRIBE conversations', (err, results) => {
    if (err) {
      console.error('Error describing conversations table:', err);
      // If the table doesn't exist, create it
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.log('Creating conversations table...');
        
        const createTableSql = `
          CREATE TABLE conversations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vehicle_id INT NULL,
            user_id_1 INT NOT NULL,
            user_id_2 INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `;
        
        connection.query(createTableSql, (err, results) => {
          if (err) {
            console.error('Error creating conversations table:', err);
          } else {
            console.log('Conversations table created successfully');
          }
          checkMessagesTable();
        });
        return;
      }
      return;
    }
    
    // Check if columns exist and add them if missing
    const requiredColumns = [
      'created_at', 'user_id_1', 'user_id_2'
    ];
    
    const missingColumns = requiredColumns.filter(
      col => !results.some(column => column.Field === col)
    );
    
    if (missingColumns.length > 0) {
      console.log(`Missing columns in conversations table: ${missingColumns.join(', ')}`);
      
      // Add missing columns
      const addColumnPromises = missingColumns.map(column => {
        let columnDef;
        
        switch (column) {
          case 'created_at':
            columnDef = 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
            break;
          default:
            columnDef = 'INT NOT NULL DEFAULT 0';
        }
        
        const sql = `ALTER TABLE conversations ADD COLUMN ${column} ${columnDef}`;
        
        return new Promise((resolve, reject) => {
          connection.query(sql, (err, results) => {
            if (err) {
              console.error(`Error adding column ${column}:`, err);
              reject(err);
            } else {
              console.log(`Column ${column} added successfully`);
              resolve();
            }
          });
        });
      });
      
      Promise.all(addColumnPromises)
        .then(() => {
          console.log('All missing columns have been added to conversations table');
          checkMessagesTable();
        })
        .catch(err => {
          console.error('Error adding missing columns:', err);
          checkMessagesTable();
        });
    } else {
      console.log('All required columns exist in conversations table');
      checkMessagesTable();
    }
  });
});

function checkMessagesTable() {
  // Also check if the messages table exists and has the correct structure
  connection.query('DESCRIBE messages', (err, results) => {
    if (err) {
      console.error('Error describing messages table:', err);
      
      // If the table doesn't exist, create it
      if (err.code === 'ER_NO_SUCH_TABLE') {
        console.log('Creating messages table...');
        
        const createTableSql = `
          CREATE TABLE messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            conversation_id INT NOT NULL,
            sender_id INT NOT NULL,
            receiver_id INT NOT NULL,
            message TEXT NOT NULL,
            vehicle_id INT NULL,
            vehicle_title VARCHAR(255) NULL,
            vehicle_image VARCHAR(255) NULL,
            is_read BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (conversation_id) REFERENCES conversations(id)
          )
        `;
        
        connection.query(createTableSql, (err, results) => {
          if (err) {
            console.error('Error creating messages table:', err);
          } else {
            console.log('Messages table created successfully');
          }
          connection.end();
        });
      } else {
        connection.end();
      }
      return;
    }
    
    console.log('Messages table exists, checking required columns...');
    
    // Check if all required columns exist
    const requiredColumns = [
      'id', 'conversation_id', 'sender_id', 'receiver_id',
      'message', 'is_read', 'created_at'
    ];
    
    const missingColumns = requiredColumns.filter(
      col => !results.some(column => column.Field === col)
    );
    
    if (missingColumns.length > 0) {
      console.log(`Missing columns in messages table: ${missingColumns.join(', ')}`);
      
      // Add missing columns
      const addColumnPromises = missingColumns.map(column => {
        let columnDef;
        
        switch (column) {
          case 'is_read':
            columnDef = 'BOOLEAN DEFAULT FALSE';
            break;
          case 'created_at':
            columnDef = 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP';
            break;
          case 'message':
            columnDef = 'TEXT NOT NULL';
            break;
          default:
            columnDef = 'INT NOT NULL';
        }
        
        const sql = `ALTER TABLE messages ADD COLUMN ${column} ${columnDef}`;
        
        return new Promise((resolve, reject) => {
          connection.query(sql, (err, results) => {
            if (err) {
              console.error(`Error adding column ${column}:`, err);
              reject(err);
            } else {
              console.log(`Column ${column} added successfully`);
              resolve();
            }
          });
        });
      });
      
      Promise.all(addColumnPromises)
        .then(() => {
          console.log('All missing columns have been added');
          connection.end();
        })
        .catch(err => {
          console.error('Error adding missing columns:', err);
          connection.end();
        });
    } else {
      console.log('All required columns exist in messages table');
      connection.end();
    }
  });
} 