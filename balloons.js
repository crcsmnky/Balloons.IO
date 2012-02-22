
/*
 * Module dependencies
 */

var express = require('express')
  , sio = require('socket.io')
  , easyoauth = require('easy-oauth')
  , redis = require('redis')
  , RedisStore = require('connect-redis')(express)
  , config = require('./config.json')
	, utils = require('./utils');

/*
 * Instanciate redis
 */

var client = redis.createClient();

/*
 * Create and config server
 */

var app = express.createServer();

app.configure(function(){
  app.set('view engine', 'jade');  
  app.use(express.static(__dirname + '/public'));
  app.use(express.bodyParser());
	app.use(express.cookieParser());
	app.use(express.session({ secret: 'foobar', store: new RedisStore }));
  app.use(easyoauth(config));
  app.use(app.router);
});

/*
 * Routes
 */

app.get('/', function(req,res,next){
  req.authenticate(['oauth'], function(error, authenticated) { 
    if(authenticated) {
      res.redirect('/rooms/list');
    } else {
      res.render('index');
    } 
  });
});

app.get('/rooms/list', utils.restrict, function(req, res){
  client.hgetall('rooms', function(err, rooms){
    res.locals({'rooms' : rooms});
    res.render('room_list');
  });
});

app.post('/create', utils.restrict, function(req, res){
  if(req.body.room_name.length <= 30) {
    client.hget('rooms', req.body.room_name, function(err, room){
      if(room) {
        res.redirect('/room/' + encodeURIComponent(req.body.room));
      } else {
        client.hset('rooms', req.body.room_name, function(err, ));
      }
    });
  } else {
    res.redirect('back');
  }
});

app.get('/room/:id', utils.restrict, function(req,res){
  client.lindex(['rooms',req.params.id],function(err,room_name){
    client.smembers('users'+req.params.id,function(error,user_list){
      client.lrange(['rooms',0,-1],function(err,rooms){
        user_list.forEach(function(user){
          user_list.splice(user_list.indexOf(user),1);
        });
        res.locals({'rooms':rooms,'room_name':room_name,'room_id':req.params.id,'username': req.getAuthDetails().user.username,'user_list':user_list});
        res.render('room');
      });
    });
  });
});

/*
 * Socket.io
 */

var io = sio.listen(app);

io.sockets.on('connection', function (socket) {

	socket.on('set nickname',function(data){
	   socket.join(data.room_id);
	   socket.set('nickname', data.nickname, function () {
	   	socket.set('room_id', data.room_id, function () {
				client.sadd('users'+data.room_id, data.nickname, function(err,added){
					if(added > 0)
		 	 			io.sockets.on(data.room_id).emit('new user',{'nickname':data.nickname});					
				});
			});
		});
	});

	socket.on('my msg',function(data){
		socket.get('nickname',function(err,nickname){
			socket.get('room_id',function(err,room_id){	
				var no_empty = data.msg.replace("\n","");
				if(no_empty.length > 0)	
	 		 		io.sockets.in(room_id).emit('new msg',{'nickname':nickname,'msg':data.msg});		
			});
		});
	});

	socket.on('disconnect',function(){
		socket.get('nickname',function(err,nickname){
			socket.get('room_id',function(e,room_id){
				client.srem('users'+room_id,nickname);
		  		io.sockets.in(room_id).emit('user leave',{'nickname': nickname});		
			});
		});
	});
});

app.listen(3000);

console.log('Balloons.io started at port %d', app.address().port);