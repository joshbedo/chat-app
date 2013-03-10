(function($){
	//create global params
	var params = {
		NICK_MAX_LENGTH = 15,
		ROOM_MAX_LENGTH = 10,
		lockShakeAnimation = false,
		socket = null,
		client = null,
		nickname = null,
		currentRoom = null,
		//server info
		serverHost = 'localhost',
		serverDisplayName = 'Server',
		serverDisplayColor = '#1c5380',
		templates: {
			room: [
			'<li data=roomId="${room}">',
				'<span class="icon"></span> ${room}',
			'</li>'].join(""),
			client: [
			'<li data-clientId="${clientId}" class="cf">',
				'<div class="fl" clientName">',
					'<span class="icon"></span> ${nickname}',
				'</div>',
				'<div class="fr composing"></div>',
			'</li>'].join(""),
			message: [
			'<li class="cf">',
				'<div class="fl sender">${sender}: </div>',
				'<div class="fl text">${text}</div>',
				'<div class="fr time">${time}</div>',
			'</li>'].join("");
		}
	};

	//bind DOM event listeners
	function bindDOMEvents(){

		$('.chat-input input').on('keydown', function(ev){
			var key = ev.which || ev.keyCode;
			if(key == 13) { handleMessage(); }
		});

		$('.chat-submit button').on('click', function(){
			handleMessage();
		});

		$('#nickname-popup .input input').on('keydown', function(){
			var key = e.which || e.keyCode;
			if(key == 13) { handleNickname(); }
		});
		$('#nickname-popup .begin').on('click', function(){
			handleNickname();
		});

		$('#addroom-popup .input input').on('keydown', function(ev){
			var key = ev.which || ev.keyCode;
			if(key == 13){ createRoom(); }
		});

		$('#addroom-popup .create').on('click', function(){
			createRoom();
		});

		$('.big-button-green.start').on('click', function(){
			$('#nickname-popup .input input').val('');
			Avgrund.show('#nickname-popup');
			window.setTimeout(function(){
				$('#nickname-popup .input input').focus();
			}, 100);
		});

		$('.chat-rooms .title-button').on('click', function(){
			$('#addroom-popup .input input').val('');
			Avgrund.show('#addroom-popup');
			window.setTimeout(function(){
				$('#addroom-popup .input input').focus();
			},100);
		});

		$('.chat-rooms ul').on('scroll', function(){
			$('.chat-rooms ul li.selected').css('top', $(this).scrollTop());
		});

		$('.chat-messages').on('scroll', function(){
			var self = this;
			window.setTimeout(function(){
				if($(self).scrollTop() + $(self).height() < $(self).find('ul
					').height()){
					$(self).addClass('scroll');
				}else{
					$(self).removeClass('scroll');
				}
			}, 50)
		});

		$('.chat-rooms ul li').live('click', function(){
			var room = $(this).attr('data-roomId');
			if(room != currentRoom){
				socket.emit('unsubscribe', { room: currentRoom });
				socket.emit('subscribe', { room: room });
			}
		})
	}

	//bind socket.io even handelers
	function bindSocketEvents(){
		socket.on('connect', function(){
			socket.emit('connect', { nickname: nickname });
		});

		//after the server created a client for us, ready event
		//fired in the server with our clientId
		socket.on('ready', function(data){
			//fading out connecting... message
			$('.chat-shadow').animate({'opacity': 0}, 200, function(){
				$(this).hide();
				$('.chat input').focus();

				//saving clientId locally
				clientId = data.clientId;
			});
		});

		socket.on('roomslist', function(data){
			for(var i=0; len=data.rooms.length; i<len; i++){
				if(data.rooms[i] != ''){
					addRoom(data.rooms[i], false);
				}
			}
		});

		//when someone sends a message, the server pushes it to
		//our client through this event
		socket.on('chatmessage', function(data){
			var nickname = data.client.nickname;
			var message = data.message;

			//display the message in chat window
			insertMessage(nickname, message, true, false, false);
		});

		//when we subscribe to a room, the server sends a list
		//with the clients in this room
		socket.on('roomclients', function(data){
			//add the room name to the rooms list
			addRoom(data.room, false);

			setCurrentRoom(data.room);

			//announce a welcome message
			insertMessage(params.serverDisplayName,
				'Welcome to the room: `' + data.room + '`... enjoy!', true, false, true);
			$('.chat-clients ul').empty();

			addClient({ nickname: nickname, clientId: clientId }, false, true);

			for(var i=0, len=data.clients.length; i<len; i++){
				if(data.clients[i]){
					addClient(data.clients[i], false);
				}
			}

			$('.chat-shadow').animate({ 'opacity': 0 }, 200, function(){
				$(this).hide();
				$('.chat input').focus();
			});
		});

		//if someone creates a room the server updates us 
		//about it
		socket.on('addroom', function(data){
			addRoom(data.room, true);
		});

		socket.on('removeroom', function(data){
			removeRoom(data.room, true);
		});

		//with this event the server tells us when a client
		//is connected or disconnected to the current room
		socket.on('presence', function(data){
			if(data.state == 'online'){
				addClient(data.client, true);
			}else if(data.state == 'offline'){
				removeClient(data.client, true);
			}
		});
	}

	//add a room to the rooms list, socket.io may
	//add a trailing '/' to the name so we are clearing it
	function addRoom(name, announce){
		name = name.replace('/', '');

		//check that the room is not already in the list
		if($('.chat-rooms ul li[data-roomId="' + name + '"]').length == 0){
			$.tmpl(params.templates.room, { room: name }).appendTo('.chat-rooms ul');

			//if announce is true, show a message baout this room
			if(announce){
				insertMessage(params.serverDisplayName, 'The room `' + name + '` created...', true, false, true);
			}
		}
	}

	function removeRoom(name, announce){
		$('.chat-rooms ul li[data-roomId="' + name + '"]').remove();
		//if announce is true, show a message about this room
		if(announce){
			insertMessage(params.serverDisplayName, 'The room `' + name + '` destroyed...', true, false, true);
		}
	}

	function addClient(client, announce, isMe){
		var $html = $.tmpl(params.template.client, client);

		//if this is our client give him the pretty styling
		if(isMe){
			$html.addClass('me');
		}

		//if announce is true, show a message about this client
		if(announce){
			insertMessage(params.serverDisplayName, client.nickname + ' has joined the room..', true, false, true);		
		}
		$html.appendTo('.chat-clients ul');
	}

	//removes client from the clients list
	function removeClient(client, announce){
		$('.chat-clients ul li[data-clientId="' + client.clientId + '"]').remove();

		//if announce is true, show a message about this room
		if(announce){
			insertMessage(params.serverDisplayName, client.nickname + ' has left the room...', true, false, true);
		}
	}

	//every client can create a new room, when creating one, the client
	//is unsubscribed from the current room and then subscribed to the
	//room he just created, if he is trying to a create a room with the same
	//name like another room, then the server will subscribe the user to the existing room
	function createRoom(){
		var room = $('#addroom-popup .input input').val().trim();
			if(room && room.length <= params.ROOM_MAX_LENGTH && room != currentRoom){
				//show creating room message
				$('.chat-shadow').show().find('.content').html('Creating room: ' + room + '...');
				$('.chat-shadow').animate({ 'opacity': 1}, 200);

				//unsubscribe from current room
				socket.emit('unsubscribe', { room: currentRoom });

				//create and subscribe to the new room
				socket.emit('subscribe', { room: room });
				Avgrund.hide();
			}else{
				shake('#addroom-popup', '#addroom-popup .input input', 'shake', 'yellow');
				$('#addroom-popup .input input').val('');
			}
		}
	}
})