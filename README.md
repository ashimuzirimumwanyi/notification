# Car Marketplace Chat Server

A WebSocket server for real-time messaging in the Car Marketplace app.

## Setup for Namecheap Hosting

1. Upload all files to your Node.js application directory on Namecheap
2. Install dependencies by running: `npm install`
3. Import the database schema from `setup_db.sql` to your MySQL database
4. Configure environment variables in the Namecheap Node.js application settings:
   - `PORT`: The port your server will run on (default: 3000)
   - `DB_HOST`: Your database host
   - `DB_USER`: Your database username
   - `DB_PASS`: Your database password
   - `DB_NAME`: Your database name (default: car_marketplace)
5. Start the application using the Namecheap Node.js control panel

## API Endpoints

- `GET /health`: Check if the server is running
- `GET /conversations/:userId`: Get all conversations for a user
- `GET /conversations/:conversationId/messages`: Get all messages in a conversation

## WebSocket Events

### Client to Server
- `authenticate`: Connect a user to the WebSocket with their userId
- `send_message`: Send a message to another user
- `typing`: Indicate that a user is typing
- `mark_as_read`: Mark messages as read

### Server to Client
- `new_message`: Receive a new message
- `message_sent`: Confirmation that a message was sent
- `user_typing`: Notification that a user is typing
- `messages_read`: Notification that messages were read
- `user_status_change`: Notification of user online/offline status
- `error`: Error notifications 