const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const { Pool } = require('pg');

// Maak een verbinding met je database
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'chatapp_database',
    password: 'Muisje2005@',
    port: 5432,
});

// Serveer de public map
app.use(express.static('public'));

// Object om ingelogde gebruikers en actieve spellen bij te houden
const loggedInUsers = new Map();
const activeGames = new Map();

io.on('connection', (socket) => {
    console.log('A user connected');

    // Registreren
    socket.on('register', (data) => {
        const { username, password } = data;
        pool.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
            [username, password],
            (err, res) => {
                if (err) {
                    if (err.code === '23505') {
                        socket.emit('registerResponse', { success: false, message: 'Gebruikersnaam bestaat al!' });
                    } else {
                        socket.emit('registerResponse', { success: false, message: 'Registratie mislukt!' });
                    }
                } else {
                    socket.emit('registerResponse', { success: true, message: 'Registratie geslaagd! Log nu in.' });
                }
            }
        );
    });

    // Inloggen
    socket.on('login', (data) => {
        const { username, password } = data;
        pool.query(
            'SELECT * FROM users WHERE username = $1 AND password = $2',
            [username, password],
            (err, res) => {
                if (err || res.rows.length === 0) {
                    socket.emit('loginResponse', { success: false, message: 'Ongeldige gebruikersnaam of wachtwoord!' });
                } else {
                    loggedInUsers.set(socket.id, username);
                    socket.emit('loginResponse', { success: true, message: 'Inloggen geslaagd!' });

                    // Stuur oude berichten
                    pool.query('SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50', (err, res) => {
                        if (err) {
                            console.log('Oeps, er ging iets mis:', err);
                        } else {
                            res.rows.reverse().forEach(row => {
                                socket.emit('chatMessage', { 
                                    nickname: row.nickname, 
                                    message: row.message, 
                                    timestamp: row.timestamp 
                                });
                            });
                        }
                    });

                    // Stuur actieve spellen
                    pool.query('SELECT * FROM games WHERE status = $1', ['active'], (err, res) => {
                        if (err) {
                            console.log('Oeps, er ging iets mis:', err);
                        } else {
                            res.rows.forEach(game => {
                                socket.emit('gameUpdate', game);
                            });
                        }
                    });
                }
            }
        );
    });

    // Start een nieuw Galgje-spel
    socket.on('startGame', (data) => {
        const player1 = loggedInUsers.get(socket.id);
        if (!player1) {
            socket.emit('error', 'Je moet inloggen om een spel te starten!');
            return;
        }

        const { player2, word } = data;
        if (!player2 || !word) {
            socket.emit('error', 'Vul een speler en een woord in!');
            return;
        }

        pool.query(
            'INSERT INTO games (player1, player2, word, guesses, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [player1, player2, word.toLowerCase(), '', 'active'],
            (err, res) => {
                if (err) {
                    socket.emit('error', 'Kon het spel niet starten!');
                } else {
                    const game = res.rows[0];
                    activeGames.set(game.id, game);
                    io.emit('gameUpdate', game);
                }
            }
        );
    });

    // Raad een letter
    socket.on('guessLetter', (data) => {
        const player2 = loggedInUsers.get(socket.id);
        if (!player2) {
            socket.emit('error', 'Je moet inloggen om te raden!');
            return;
        }

        const { gameId, letter } = data;
        const game = activeGames.get(gameId);
        if (!game || game.player2 !== player2) {
            socket.emit('error', 'Ongeldig spel of je bent niet de speler die mag raden!');
            return;
        }

        // Voeg de geraden letter toe
        const guesses = game.guesses ? game.guesses.split(',') : [];
        if (guesses.includes(letter)) {
            socket.emit('error', 'Letter al geraden!');
            return;
        }
        guesses.push(letter);
        game.guesses = guesses.join(',');

        // Controleer of de letter in het woord zit
        const word = game.word;
        const wordLetters = word.split('');
        const correctLetters = wordLetters.filter(l => guesses.includes(l));
        const wrongGuesses = guesses.filter(g => !word.includes(g));
        const maxWrongGuesses = 6;

        // Controleer spelstatus
        let status = 'active';
        if (wrongGuesses.length >= maxWrongGuesses) {
            status = 'lost';
        } else if (wordLetters.every(l => guesses.includes(l))) {
            status = 'won';
        }

        game.status = status;
        activeGames.set(gameId, game);

        // Update de database
        pool.query(
            'UPDATE games SET guesses = $1, status = $2 WHERE id = $3 RETURNING *',
            [game.guesses, game.status, gameId],
            (err, res) => {
                if (err) {
                    socket.emit('error', 'Kon de gok niet opslaan!');
                } else {
                    io.emit('gameUpdate', res.rows[0]);
                }
            }
        );
    });

    // Chatbericht
    socket.on('chatMessage', (msg) => {
        const username = loggedInUsers.get(socket.id);
        if (!username) {
            socket.emit('error', 'Je moet inloggen om te chatten!');
            return;
        }

        pool.query(
            'INSERT INTO messages (nickname, message) VALUES ($1, $2) RETURNING *',
            [username, msg.message],
            (err, res) => {
                if (err) {
                    console.log('Oeps, er ging iets mis:', err);
                } else {
                    const savedMessage = res.rows[0];
                    io.emit('chatMessage', { 
                        nickname: savedMessage.nickname, 
                        message: savedMessage.message, 
                        timestamp: savedMessage.timestamp 
                    });
                }
            }
        );
    });

    socket.on('disconnect', () => {
        loggedInUsers.delete(socket.id);
        console.log('A user disconnected');
    });
});

http.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});