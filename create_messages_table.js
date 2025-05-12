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
  
  // Create messages table if it doesn't exist
  const createMessagesTableSQL = `
    CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      conversation_id INT NOT NULL,
      sender_id INT NOT NULL,
      receiver_id INT NOT NULL,
      message TEXT NOT NULL,
      listing_id INT NULL,
      listing_type VARCHAR(50) NULL,
      listing_title VARCHAR(255) NULL,
      listing_image VARCHAR(255) NULL,
      vehicle_id INT NULL,
      vehicle_title VARCHAR(255) NULL,
      vehicle_image VARCHAR(255) NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `;
  
  connection.query(createMessagesTableSQL, (err, result) => {
    if (err) {
      console.error('Error creating messages table:', err);
    } else {
      console.log('Messages table created successfully or already exists');
    }
    
    connection.end();
  });
}); 