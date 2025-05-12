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
  
  // Add vehicle_id column to conversations table
  const addColumnSQL = `ALTER TABLE conversations ADD COLUMN vehicle_id INT NULL;`;
  
  connection.query(addColumnSQL, (err, results) => {
    if (err) {
      // If column already exists, this is not a problem
      if (err.code === 'ER_DUP_FIELDNAME') {
        console.log('Column vehicle_id already exists in conversations table');
      } else {
        console.error('Error adding vehicle_id column:', err);
      }
    } else {
      console.log('Added vehicle_id column to conversations table successfully');
    }
    
    // Also add vehicle columns to messages table
    const addMessageColumnsSQL = `
      ALTER TABLE messages 
      ADD COLUMN vehicle_id INT NULL,
      ADD COLUMN vehicle_title VARCHAR(255) NULL,
      ADD COLUMN vehicle_image VARCHAR(255) NULL;
    `;
    
    connection.query(addMessageColumnsSQL, (err, results) => {
      if (err) {
        // If columns already exist, not a problem
        if (err.code === 'ER_DUP_FIELDNAME') {
          console.log('Vehicle columns already exist in messages table');
        } else {
          console.error('Error adding vehicle columns to messages table:', err);
        }
      } else {
        console.log('Added vehicle columns to messages table successfully');
      }
      
      // Close the connection
      connection.end();
    });
  });
}); 