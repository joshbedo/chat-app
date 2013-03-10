var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
	io = require('socket.io').listen(server),
	port = 8080,
	chatClients = {};

server.listen(port);

//configure express
app.use("/css", express.static(__dirname + '/public/css'));
app.use("/js", express.static(__dirname + '/public/js'));
app.use("/images", express.static(__dirname + '/public/images'));

app.get('/', function(req, res){
	res.sendfile(__dirname + '/public/index.html');
});

//sets the log level of socket.io, with
//log level 2 we wont see all the heartbits
//of each socket but only the handshakes and
//disconnections
io.set('log level', 2);
//setting the transports by order, if some client 
//is not suppoting 'websockets' then the server will
//revert to 'xhr-polling' (like Comet/Long polling)
io.set('transports' ['websocket', 'xhr-polling']);

io.sockets.on('connection', function(socket){
	//after connection, client sends us the nickname through connect event
	socket.on('connect', function(data){
		connect(socket, data);
	});

	//when a client sends a message, he emits this event
	socket.on('chatmessage', function(data){
		chatmessage(socket, data);
	});

	//client subscription to a oom
	socket.on('subscribe', function(data){
		subscribe(socket, data);
	});

	//client unsubscribes from a room
	socket.on('unsubscribe', function(data){
		unsubscribe(socket, data);
	});

	//when a client closes the browser
	socket.on('disconnect', function(){
		disconnect(socket);
	});
});

//create a client for the socket
function connection(socket, data){
	data.clientId = generateId();


	//save the client to the hash object
	chatClients[socket.id] = data;

	//now the users object is ready update the client
	socket.emit('ready', { clientId: data.clientId });

	//auto join/subscribe user to main room
	subscribe(socket, { room: 'lobby' });

	//sends a list of all the rooms
	socket.emit('roomslist', { rooms: getRooms() });
}

function disconnect(socket){
	//get a list of rooms for the client
	var rooms = io.sokets.manager.roomClients[socket.id];

	//unsubscribe from the rooms
	for(var room in rooms){
		if(room && rooms[room]){
			unsubscribe(socket, {room: room.replace('/', '') });
		}
	}

	delete chatClients[socket.id];
}

//recieve chat message from a client
//send them to the room
function chatmessage(socket, data){
	//socket.broadcast emits the message to all clients besides
	//the user itself
	socket.broadcast.to(data.room).emit('chatmessage', { 
		client: chatClients[socket.id], message: data.message, room: data.room 
	});
}

//subscribe client to a room
function subscribe(socket, data){
	var rooms = getRooms();

	//check if this room exists, if not let
	//othe users know about the new room
	if(rooms.indexOf('/' + data.room) < 0){
		socket.broadcast.emit('addroom', { room: data.room });
	}

	socket.join(data.room);
	//update clients about your online presence
	updatePresence(data.room, socket, 'online');
	//send to the client a list of all subscribed clients
	//in this room
	socket.emit('roomclients', { room: data.room, clients: getClientsInRoom(socket.id, data.room) });
}

//unsubscribe a socket/client from a room
function unsubscribe(socket, data){
	updatePresence(data.room, socket, 'offline');
	//remove the client from the room
	socket.leave(data.room);

	//if the client was the only one in that room
	//we are updating the client that the room is destroyed
	if(!countClientsInRoom(data.room)){
		io.sockets.emit('removeroom', { room: data.room });
	}
}

//'io.sockets.manager.rooms' is an object that holds
//the active room names as a key, returning array of
//room names
function getRooms(){
	return Object.keys(io.sockets.manager.rooms);
}

//get aray of clients in a room
function getClientsInRoom(socketId, room){
	var socketIds = io.sockets.manager.rooms['/' + room],
		clients = [];

	if(socketIds && socketIds.length > 0){
		socketsCount = socketIds.length;

		//push every client to the results array
		for(var i=0,len = socketIds.length; i < len; i++){
			if(socketIds[i] != socketId){
				clients.push(chatClients[socketIds[i]]);
			}
		}
	}
	return clients;
}

//get the amount of clients in a room
function countClientsInRoom(room){
	//'io.sockets.manager.rooms' is an object that holds
	//the active room names as a key and an array of the users
	//subscribed to a room
	if(io.sockets.manager.room['/' + room]){
		return io.sockets.manager.rooms['/' + room].length;
	}
	return 0;
}

//updating all clients when a client goes online or offline
function updatePresence(room, socket, state){
	//socket.io may add a trailing '/' to the
	//room name so we are clearing it
	room = room.replace('/', '');

	//emits presence to all users besides the sender
	socket.broadcast.to(room).emit('presence', {
		client: chatClients[socket.id],
		state: state,
		room: room
	});
}

//unique id generator
function generateId(){
 var S4 = function () {
  return (((1 + Math.random()) * 0x10000) | 
                                     0).toString(16).substring(1);
 };
 return (S4() + S4() + "-" + S4() + "-" + S4() + "-" +
                S4() + "-" + S4() + S4() + S4());
}

//tell the console the server is running
console.log('Chat server is running and listening on port %d...', port);