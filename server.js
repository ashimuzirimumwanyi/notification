const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql');
const cors = require('cors');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Database connection
const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'car_marketplace',
  socketPath: process.env.DB_SOCKET || '/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock'
});

// Test database connection
db.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err);
  } else {
    console.log('Connected to database');
    connection.release();
  }
});

// Store active connections
const activeUsers = {};

// Store pending notifications for offline users
const pendingNotifications = {};

// Socket connection handling
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);
  
  // User authentication
  socket.on('authenticate', (userData) => {
    console.log('==== SOCKET AUTHENTICATION ====');
    console.log('Authentication request received:', userData);
    const userId = userData.userId;
    activeUsers[userId] = socket.id;
    console.log(`User ${userId} authenticated with socket ${socket.id}`);
    
    // Send notification of online status
    io.emit('user_status_change', { userId, status: 'online' });
    
    // Add user to a notification room for receiving broadcasts
    socket.join('notification_broadcast');
    console.log(`Added user ${userId} to notification_broadcast room`);
    console.log('Current notification room members:', 
      io.sockets.adapter.rooms.get 
        ? (io.sockets.adapter.rooms.get('notification_broadcast') 
          ? io.sockets.adapter.rooms.get('notification_broadcast').size 
          : 0) 
        : 0);
    
    // Check if there are any pending notifications for this user
    if (pendingNotifications[userId] && pendingNotifications[userId].length > 0) {
      console.log(`Found ${pendingNotifications[userId].length} pending notifications for user ${userId}`);
      
      // Send each pending notification
      pendingNotifications[userId].forEach(notification => {
        console.log('Sending pending notification:', notification.type);
        
        if (notification.type === 'message') {
          // Send pending message notification
          io.to(socket.id).emit('message_notification', notification);
        }
      });
      
      // Clear the pending notifications for this user
      delete pendingNotifications[userId];
      console.log(`Cleared pending notifications for user ${userId}`);
    }
    
    console.log('==== END SOCKET AUTHENTICATION ====');
  });
  
  // Handle new ad notification
  socket.on('new_ad_posted', (data) => {
    console.log('==== NEW AD NOTIFICATION RECEIVED ====');
    console.log('Socket ID:', socket.id);
    console.log('Full notification data:', JSON.stringify(data, null, 2));
    
    const { 
      poster_id, 
      listing_id, 
      listing_type, 
      listing_title, 
      listing_price,
      listing_image
    } = data;
    
    console.log(`New ${listing_type} ad posted by user ${poster_id}:`, listing_title);
    console.log('Notification broadcast room size:', 
      io.sockets.adapter.rooms.get 
        ? (io.sockets.adapter.rooms.get('notification_broadcast') 
          ? io.sockets.adapter.rooms.get('notification_broadcast').size 
          : 0) 
        : 0);
    
    // Get poster information
    db.query(
      'SELECT name FROM users WHERE id = ?',
      [poster_id],
      (err, results) => {
        if (err) {
          console.error("Error getting poster info:", err);
          return;
        }
        
        const posterName = results.length > 0 ? results[0].name : "A user";
        
        // Format price with currency
        const formattedPrice = listing_price ? 
          `$${parseFloat(listing_price).toLocaleString()}` :
          "Price not specified";
        
        // Create notification payload
        const notificationPayload = {
          listing_id,
          listing_type,
          listing_title,
          listing_price: formattedPrice,
          listing_image,
          poster_id,
          poster_name: posterName,
          title: 'New Listing Posted',
          body: `${posterName} just posted ${listing_type}: ${listing_title} for ${formattedPrice}`,
          timestamp: new Date().toISOString()
        };
        
        console.log('Broadcasting notification with payload:', JSON.stringify(notificationPayload, null, 2));
        
        // Broadcast to all connected clients except the poster
        socket.to('notification_broadcast').emit('new_ad_notification', notificationPayload);
        
        console.log('Notification broadcast complete');
        console.log('==== END NEW AD NOTIFICATION PROCESSING ====');
      }
    );
  });
  
  // Handle new message
  socket.on('send_message', (data) => {
    const { 
      sender_id, 
      receiver_id, 
      message, 
      conversation_id, 
      vehicle_id, 
      vehicle_title, 
      vehicle_image,
      listing_id,
      listing_type,
      listing_title,
      listing_image
    } = data;
    
    // Use generic listing fields if provided, fall back to vehicle fields for backward compatibility
    const finalListingId = listing_id || vehicle_id;
    const finalListingType = listing_type || (vehicle_id ? 'vehicle' : null);
    const finalListingTitle = listing_title || vehicle_title;
    const finalListingImage = listing_image || vehicle_image;
    
    // Validate sender and receiver
    db.query(
      'SELECT id FROM users WHERE id = ?',
      [receiver_id],
      (err, results) => {
        if (err || results.length === 0) {
          console.error("Receiver user doesn't exist:", err || "No matching user");
          socket.emit('error', { message: 'Receiver user not found' });
          return;
        }
        
        // Create conversation if it doesn't exist
        if (!conversation_id) {
          // Check if a conversation already exists for this specific listing between these users
          if (finalListingId) {
            db.query(
              'SELECT id FROM conversations WHERE ((user_id_1 = ? AND user_id_2 = ?) OR (user_id_1 = ? AND user_id_2 = ?)) AND listing_id = ? AND listing_type = ?',
              [sender_id, receiver_id, receiver_id, sender_id, finalListingId, finalListingType],
              (err, results) => {
                if (err) {
                  console.error("Error checking existing conversation:", err);
                  socket.emit('error', { message: 'Failed to check for existing conversation' });
                  return;
                }
                
                if (results.length > 0) {
                  // Use existing conversation for this listing
                  const existingConversationId = results[0].id;
                  saveAndSendMessage(
                    sender_id, 
                    receiver_id, 
                    message, 
                    existingConversationId,
                    finalListingId,
                    finalListingType,
                    finalListingTitle,
                    finalListingImage
                  );
                } else {
                  // Create new conversation for this listing
                  db.query(
                    'INSERT INTO conversations (user_id_1, user_id_2, listing_id, listing_type, created_at) VALUES (?, ?, ?, ?, NOW())',
                    [sender_id, receiver_id, finalListingId, finalListingType],
                    (err, result) => {
                      if (err) {
                        console.error("Error creating conversation:", err);
                        socket.emit('error', { message: 'Failed to create conversation' });
                        return;
                      }
                      
                      const newConversationId = result.insertId;
                      saveAndSendMessage(
                        sender_id, 
                        receiver_id, 
                        message, 
                        newConversationId,
                        finalListingId,
                        finalListingType,
                        finalListingTitle,
                        finalListingImage
                      );
                    }
                  );
                }
              }
            );
          } else {
            // No listing ID, create a regular conversation
            db.query(
              'INSERT INTO conversations (user_id_1, user_id_2, created_at) VALUES (?, ?, NOW())',
              [sender_id, receiver_id],
              (err, result) => {
                if (err) {
                  console.error("Error creating conversation:", err);
                  socket.emit('error', { message: 'Failed to create conversation' });
                  return;
                }
                
                const newConversationId = result.insertId;
                saveAndSendMessage(
                  sender_id, 
                  receiver_id, 
                  message, 
                  newConversationId,
                  finalListingId,
                  finalListingType,
                  finalListingTitle,
                  finalListingImage
                );
              }
            );
          }
        } else {
          saveAndSendMessage(
            sender_id, 
            receiver_id, 
            message, 
            conversation_id,
            finalListingId,
            finalListingType,
            finalListingTitle,
            finalListingImage
          );
        }
      }
    );
  });
  
  // Function to save and send message
  function saveAndSendMessage(
    sender_id, 
    receiver_id, 
    message, 
    conversation_id, 
    listing_id, 
    listing_type, 
    listing_title, 
    listing_image
  ) {
    const query = `
      INSERT INTO messages (
        sender_id, 
        receiver_id, 
        message, 
        conversation_id, 
        listing_id, 
        listing_type, 
        listing_title, 
        listing_image, 
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    
    db.query(
      query, 
      [
        sender_id, 
        receiver_id, 
        message, 
        conversation_id, 
        listing_id, 
        listing_type, 
        listing_title, 
        listing_image
      ], 
      (err, result) => {
        if (err) {
          console.error("Error saving message:", err);
          socket.emit('error', { message: 'Failed to save message' });
          return;
        }
        
        const messageId = result.insertId;
        
        // Get user information for both sender and receiver
        db.query(
          'SELECT id, name, avatar FROM users WHERE id IN (?, ?)',
          [sender_id, receiver_id],
          (err, userResults) => {
            if (err) {
              console.error("Error fetching user info:", err);
              return;
            }
            
            // Find sender and receiver info
            const senderInfo = userResults.find(user => user.id == sender_id) || { name: "Unknown User", avatar: null };
            const receiverInfo = userResults.find(user => user.id == receiver_id) || { name: "Unknown User", avatar: null };
            
            // Get the saved message with timestamp and add user info
            db.query(
              'SELECT * FROM messages WHERE id = ?', 
              [messageId], 
              (err, results) => {
                if (err || results.length === 0) {
                  console.error("Error retrieving saved message:", err);
                  return;
                }
                
                const fullMessage = {
                  ...results[0],
                  sender_name: senderInfo.name,
                  sender_avatar: senderInfo.avatar,
                  receiver_name: receiverInfo.name,
                  receiver_avatar: receiverInfo.avatar
                };
                
                console.log(`Sending message from ${senderInfo.name} to ${receiverInfo.name}`);
                
                // Create message preview - truncate if too long
                const messagePreview = message.length > 50 
                  ? message.substring(0, 47) + '...' 
                  : message;
                
                // Create notification payload for message
                const notificationPayload = {
                  message_id: messageId,
                  conversation_id: conversation_id,
                  sender_id: sender_id,
                  sender_name: senderInfo.name,
                  message_preview: messagePreview,
                  listing_id: listing_id,
                  listing_type: listing_type,
                  listing_title: listing_title,
                  title: `New message from ${senderInfo.name}`,
                  body: messagePreview,
                  type: 'message',
                  timestamp: new Date().toISOString()
                };
                
                // Send to receiver if online
                if (activeUsers[receiver_id]) {
                  // First send the actual message
                  io.to(activeUsers[receiver_id]).emit('new_message', fullMessage);
                  
                  // Then send a notification for the message
                  console.log('===== SENDING MESSAGE NOTIFICATION =====');
                  console.log(`Sending notification to user ${receiver_id} for new message`);
                  console.log('Notification payload:', JSON.stringify(notificationPayload, null, 2));
                  
                  // Always send message notifications regardless of conversation status
                  io.to(activeUsers[receiver_id]).emit('message_notification', notificationPayload);
                  console.log(`Message notification sent to socket ${activeUsers[receiver_id]}`);
                  console.log('===== END MESSAGE NOTIFICATION =====');
                } else {
                  console.log(`Receiver ${receiver_id} is not online, queueing notification for delivery`);
                  
                  // Store notification for delivery when user comes online
                  // Note: In production, you might want to persist this in a database
                  if (!pendingNotifications[receiver_id]) {
                    pendingNotifications[receiver_id] = [];
                  }
                  
                  pendingNotifications[receiver_id].push({
                    type: 'message',
                    message_id: messageId,
                    conversation_id: conversation_id,
                    sender_id: sender_id,
                    sender_name: senderInfo.name,
                    message_preview: messagePreview,
                    listing_id: listing_id,
                    listing_type: listing_type,
                    listing_title: listing_title,
                    title: `New message from ${senderInfo.name}`,
                    body: messagePreview,
                    timestamp: new Date().toISOString()
                  });
                }
                
                // Confirm message saved to sender
                socket.emit('message_sent', fullMessage);
              }
            );
          }
        );
      }
    );
  }
  
  // Handle typing events
  socket.on('typing', (data) => {
    const { sender_id, receiver_id } = data;
    if (activeUsers[receiver_id]) {
      io.to(activeUsers[receiver_id]).emit('user_typing', { sender_id });
    }
  });
  
  // Handle reading messages
  socket.on('mark_as_read', (data, callback) => {
    const { message_id, conversation_id, reader_id } = data;
    
    // Function to attempt the database update with retries
    const updateMessagesWithRetry = (retryCount = 0, maxRetries = 3) => {
      // Update message status in the database
      const query = message_id 
        ? 'UPDATE messages SET is_read = TRUE WHERE id = ?'
        : 'UPDATE messages SET is_read = TRUE WHERE conversation_id = ? AND receiver_id = ?';
      
      const params = message_id ? [message_id] : [conversation_id, reader_id];
      
      console.log(`Attempt ${retryCount + 1}/${maxRetries + 1} to mark messages as read:`, params);
      
      // Get a connection from the pool for transaction
      db.getConnection((connErr, connection) => {
        if (connErr) {
          console.error('Error getting DB connection:', connErr);
          if (callback && typeof callback === 'function') {
            callback({ 
              error: 'Database connection error', 
              retry: false
            });
          }
          return;
        }
        
        // Begin transaction
        connection.beginTransaction((transErr) => {
          if (transErr) {
            console.error('Error beginning transaction:', transErr);
            connection.release();
            if (callback && typeof callback === 'function') {
              callback({ 
                error: 'Transaction error', 
                retry: false
              });
            }
            return;
          }
          
          // Execute the query within the transaction
          connection.query(query, params, (err, result) => {
            if (err) {
              // Rollback the transaction
              return connection.rollback(() => {
                connection.release();
                console.error(`Error marking messages as read (attempt ${retryCount + 1}):`, err);
                
                // Check if it's a deadlock error and we haven't exceeded max retries
                if (err.code === 'ER_LOCK_DEADLOCK' && retryCount < maxRetries) {
                  // Calculate exponential backoff delay with jitter
                  const baseDelay = Math.pow(2, retryCount) * 50; 
                  const jitter = Math.random() * baseDelay;
                  const delay = baseDelay + jitter;
                  
                  console.log(`Deadlock detected. Retrying in ${Math.round(delay)}ms...`);
                  
                  // Retry after a delay with exponential backoff
                  setTimeout(() => {
                    updateMessagesWithRetry(retryCount + 1, maxRetries);
                  }, delay);
                  
                  // If client is waiting for acknowledgment, tell it to retry
                  if (callback && typeof callback === 'function') {
                    callback({ 
                      error: 'Deadlock detected, please retry', 
                      retry: true,
                      delay: Math.round(delay)
                    });
                  }
                  return;
                }
                
                // If it's not a deadlock or we've exceeded retries, just log the error
                console.error('Failed to mark messages as read after retries:', err);
                socket.emit('error', { message: 'Failed to mark messages as read' });
                
                // Send error in acknowledgment if client is waiting
                if (callback && typeof callback === 'function') {
                  callback({ 
                    error: 'Failed to mark messages as read: ' + err.message, 
                    retry: false
                  });
                }
              });
            }
            
            // Commit the transaction
            connection.commit((commitErr) => {
              if (commitErr) {
                return connection.rollback(() => {
                  connection.release();
                  console.error('Error committing transaction:', commitErr);
                  if (callback && typeof callback === 'function') {
                    callback({ 
                      error: 'Transaction commit error', 
                      retry: false
                    });
                  }
                });
              }
              
              // Release the connection
              connection.release();
              console.log('Successfully marked messages as read');
              
              // Send success acknowledgment if client is waiting
              if (callback && typeof callback === 'function') {
                callback({ success: true });
              }
              
              // Notify message sender that messages were read
              if (conversation_id) {
                db.query(
                  'SELECT DISTINCT sender_id FROM messages WHERE conversation_id = ? AND receiver_id = ?',
                  [conversation_id, reader_id],
                  (err, results) => {
                    if (err || results.length === 0) return;
                    
                    const senders = results.map(row => row.sender_id);
                    senders.forEach(sender_id => {
                      if (activeUsers[sender_id]) {
                        io.to(activeUsers[sender_id]).emit('messages_read', { 
                          conversation_id, 
                          reader_id 
                        });
                      }
                    });
                  }
                );
              }
            });
          });
        });
      });
    };
    
    // Start the retry process
    updateMessagesWithRetry();
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Find and remove user from active users
    for (const [userId, socketId] of Object.entries(activeUsers)) {
      if (socketId === socket.id) {
        delete activeUsers[userId];
        // Notify others this user went offline
        io.emit('user_status_change', { userId, status: 'offline' });
        break;
      }
    }
  });
});

// REST API endpoint to get conversations
app.get('/conversations/:userId', (req, res) => {
  const { userId } = req.params;
  
  const query = `
    SELECT 
      c.id as conversation_id, 
      c.listing_id, c.listing_type,
      c.user_id_1, c.user_id_2,
      m.sender_id, m.receiver_id, m.message, m.created_at, 
      m.listing_title, m.listing_image,
      u1.name as user1_name, u1.avatar as user1_avatar,
      u2.name as user2_name, u2.avatar as user2_avatar
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    JOIN users u1 ON c.user_id_1 = u1.id
    JOIN users u2 ON c.user_id_2 = u2.id
    WHERE (c.user_id_1 = ? OR c.user_id_2 = ?)
    ORDER BY m.created_at DESC
  `;
  
  db.query(query, [userId, userId], (err, results) => {
    if (err) {
      return res.status(500).json({error: err.message});
    }
    
    // Process results to get unique conversations with latest message
    const conversations = {};
    results.forEach(row => {
      const conversationId = row.conversation_id;
      if (!conversations[conversationId]) {
        // Determine which user is the other user (not the current user)
        const isUser1 = row.user_id_1 == userId;
        const otherUserId = isUser1 ? row.user_id_2 : row.user_id_1;
        const otherUserName = isUser1 ? row.user2_name : row.user1_name;
        const otherUserAvatar = isUser1 ? row.user2_avatar : row.user1_avatar;
        
        conversations[conversationId] = {
          id: conversationId,
          other_user_id: otherUserId,
          other_user_name: otherUserName || 'Unknown User',
          other_user_avatar: otherUserAvatar,
          last_message: row.message,
          last_message_time: row.created_at,
          listing_id: row.listing_id,
          listing_type: row.listing_type,
          listing_title: row.listing_title,
          listing_image: row.listing_image
        };
      }
    });
    
    res.json(Object.values(conversations));
  });
});

// REST API endpoint to get message history
app.get('/conversations/:conversationId/messages', (req, res) => {
  const { conversationId } = req.params;
  const query = `    SELECT 
      m.*, 
      c.listing_id, c.listing_type,
      c.user_id_1, c.user_id_2,
      u1.name as user1_name, u1.avatar as user1_avatar,
      u2.name as user2_name, u2.avatar as user2_avatar
    FROM conversations c
    LEFT JOIN messages m ON c.id = m.conversation_id
    JOIN users u1 ON c.user_id_1 = u1.id
    JOIN users u2 ON c.user_id_2 = u2.id
    WHERE c.id = ? 
    ORDER BY m.created_at ASC
  `;
  
  db.query(query, [conversationId], (err, results) => {
    if (err) {
      return res.status(500).json({error: err.message});
    }
    
    // Format the results to include proper sender/receiver info
    const messages = results.map(row => {
      // Determine sender and receiver info
      const isSenderUser1 = row.sender_id == row.user_id_1;
      
      return {
        ...row,
        sender_name: isSenderUser1 ? row.user1_name : row.user2_name,
        sender_avatar: isSenderUser1 ? row.user1_avatar : row.user2_avatar,
        receiver_name: isSenderUser1 ? row.user2_name : row.user1_name,
        receiver_avatar: isSenderUser1 ? row.user2_avatar : row.user1_avatar,
      };
    });
    
    res.json(messages);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({status: 'ok', timestamp: new Date().toISOString()});
});

// Start the server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app; 
