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
  
  // First check for existing triggers on the conversations table
  connection.query("SHOW TRIGGERS WHERE `Table` = 'conversations'", (err, results) => {
    if (err) {
      console.error('Error checking triggers:', err);
      connection.end();
      return;
    }
    
    // Get all triggers on the conversations table
    if (results.length > 0) {
      console.log(`Found ${results.length} triggers on conversations table`);
      
      // Drop all triggers
      const dropPromises = results.map(trigger => {
        return new Promise((resolve, reject) => {
          const dropSQL = `DROP TRIGGER IF EXISTS ${trigger.Trigger}`;
          connection.query(dropSQL, (err) => {
            if (err) {
              console.error(`Error dropping trigger ${trigger.Trigger}:`, err);
              reject(err);
            } else {
              console.log(`Dropped trigger ${trigger.Trigger}`);
              resolve();
            }
          });
        });
      });
      
      Promise.all(dropPromises)
        .then(() => createNewTrigger())
        .catch(err => {
          console.error('Error dropping triggers:', err);
          connection.end();
        });
    } else {
      console.log('No triggers found on conversations table');
      createNewTrigger();
    }
  });
  
  // Create a new trigger that considers listing_id and listing_type
  function createNewTrigger() {
    const createTriggerSQL = `
      CREATE TRIGGER check_conversation_unique BEFORE INSERT ON conversations
      FOR EACH ROW
      BEGIN
        DECLARE count_existing INT;
        
        SELECT COUNT(*) INTO count_existing 
        FROM conversations 
        WHERE ((user_id_1 = NEW.user_id_1 AND user_id_2 = NEW.user_id_2) 
              OR (user_id_1 = NEW.user_id_2 AND user_id_2 = NEW.user_id_1))
              AND listing_id = NEW.listing_id 
              AND listing_type = NEW.listing_type;
              
        IF count_existing > 0 THEN
          SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'Conversation already exists between these users for this listing';
        END IF;
      END
    `;
    
    connection.query(createTriggerSQL, (err) => {
      if (err) {
        console.error('Error creating new trigger:', err);
      } else {
        console.log('Created new trigger that respects listing_id and listing_type');
      }
      
      connection.end();
    });
  }
}); 