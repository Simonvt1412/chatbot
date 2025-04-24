// public/script.js
document.addEventListener('DOMContentLoaded', function() {
    // DOM elementen ophalen
    const loginScreen = document.getElementById('login-screen');
    const chatScreen = document.getElementById('chat-screen');
    const usernameInput = document.getElementById('username');
    const joinBtn = document.getElementById('join-btn');
    const currentUserDisplay = document.getElementById('current-user');
    const usersList = document.getElementById('users-list');
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const recipientSelect = document.getElementById('recipient');
    const typingNotification = document.getElementById('typing-notification');
    
    // Socket.io verbinding opzetten
    const socket = io();
    
    // Huidige gebruikersnaam
    let currentUsername = '';
    
    // Typingstatus
    let typingTimeout;
    
    // Event listener voor het deelnemen aan de chat
    joinBtn.addEventListener('click', function() {
        const username = usernameInput.value.trim();
        
        if (username) {
            currentUsername = username;
            
            // Gebruikersnaam naar de server sturen
            socket.emit('userJoin', username);
            
            // Switch van login naar chat scherm
            loginScreen.style.display = 'none';
            chatScreen.style.display = 'block';
            
            // Gebruikersnaam weergeven in de header
            currentUserDisplay.textContent = `Ingelogd als: ${username}`;
        }
    });
    
    // Enter-toets voor loginscherm
    usernameInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            joinBtn.click();
        }
    });
    
    // Event listener voor het versturen van berichten
    sendBtn.addEventListener('click', sendMessage);
    
    // Enter-toets voor berichten versturen
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Functie om berichten te verzenden
    function sendMessage() {
        const message = messageInput.value.trim();
        const recipient = recipientSelect.value;
        
        if (message) {
            if (recipient === 'everyone') {
                // Bericht naar iedereen versturen
                socket.emit('chatMessage', { text: message });
            } else {
                // Privébericht versturen
                socket.emit('privateMessage', { 
                    recipient: recipient,
                    text: message 
                });
            }
            
            // Input veld leegmaken
            messageInput.value = '';
            
            // Typing status stoppen
            clearTimeout(typingTimeout);
            socket.emit('stopTyping');
        }
    }
    
    // Typing notification event
    messageInput.addEventListener('input', function() {
        // Als er een timeout loopt, deze resetten
        clearTimeout(typingTimeout);
        
        // Alleen een typing event sturen als er tekst is
        if (messageInput.value.trim() !== '') {
            socket.emit('typing');
            
            // Timeout instellen voor als gebruiker stopt met typen
            typingTimeout = setTimeout(() => {
                socket.emit('stopTyping');
            }, 2000);
        } else {
            socket.emit('stopTyping');
        }
    });
    
    // Socket.io events
    
    // Welkom bericht ontvangen
    socket.on('welcome', function(data) {
        addMessage({
            type: 'system',
            text: data.message
        });
    });
    
    // Gebruiker toegetreden
    socket.on('userJoined', function(data) {
        addMessage({
            type: 'system',
            text: data.message
        });
    });
    
    // Gebruiker vertrokken
    socket.on('userLeft', function(data) {
        addMessage({
            type: 'system',
            text: data.message
        });
    });
    
    // Gebruikerslijst bijwerken
    socket.on('userList', function(users) {
        // Gebruikerslijst leegmaken
        usersList.innerHTML = '';
        
        // Dropdown voor privéberichten leegmaken en standaardoptie toevoegen
        recipientSelect.innerHTML = '<option value="everyone">Iedereen</option>';
        
        // Gebruikers toevoegen aan de lijst en dropdown
        users.forEach(user => {
            // Niet de huidige gebruiker toevoegen aan de dropdown
            if (user !== currentUsername) {
                // Toevoegen aan de zijbalk
                const userItem = document.createElement('li');
                userItem.textContent = user;
                usersList.appendChild(userItem);
                
                // Toevoegen aan de dropdown
                const option = document.createElement('option');
                option.value = user;
                option.textContent = user;
                recipientSelect.appendChild(option);
            }
        });
    });
    
    // Chatbericht ontvangen
    socket.on('message', function(data) {
        addMessage({
            type: data.username === currentUsername ? 'sent' : 'received',
            username: data.username,
            text: data.text,
            time: data.time
        });
    });
    
    // Privébericht ontvangen
    socket.on('privateMessage', function(data) {
        addMessage({
            type: 'private received',
            username: `${data.from} (privé)`,
            text: data.text,
            time: data.time
        });
    });
    
    // Privébericht verzonden
    socket.on('privateMessageSent', function(data) {
        addMessage({
            type: 'private sent',
            username: `Aan ${data.to} (privé)`,
            text: data.text,
            time: data.time
        });
    });
    
    // Typing notification
    socket.on('userTyping', function(username) {
        typingNotification.textContent = `${username} typt...`;
    });
    
    socket.on('userStoppedTyping', function() {
        typingNotification.textContent = '';
    });
    
    // Foutmelding
    socket.on('error', function(data) {
        addMessage({
            type: 'system',
            text: `Fout: ${data.message}`
        });
    });
    
    // Functie om berichten toe te voegen aan de chat
    function addMessage(data) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', data.type);
        
        let messageContent = '';
        
        if (data.type === 'system') {
            messageContent = `<div class="message-text">${data.text}</div>`;
        } else {
            messageContent = `
                <div class="username">${data.username || currentUsername}</div>
                <div class="message-text">${data.text}</div>
                ${data.time ? `<div class="time">${data.time}</div>` : ''}
            `;
        }
        
        messageDiv.innerHTML = messageContent;
        messagesContainer.appendChild(messageDiv);
        
        // Scroll naar beneden om het nieuwste bericht te zien
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
});