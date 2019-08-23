var express = require("express");
var session = require('express-session');
var minimist = require('minimist');
require('colors');

const Datastore = require('nedb');
const requests_historic = new Datastore({filename: "nedb/requests_historic.db", autoload: true});

var NedbStore = require('nedb-session-store')(session);

var app = express();

const http = require('http');
const WebSocketServer = require('ws').Server;

var server = http.createServer(app);
const wss = new WebSocketServer({server});

var confs = JSON.parse(fs.readFileSync("configs.json"));

var session_conf = 
{
    secret: 'electron-builder-online_h6cg89rjdfl0x8',
    cookie:{
        maxAge: 3600000
    },
    store: new NedbStore({
        filename: 'nedbs/sessions.db'
    })
};
var sess = session(session_conf);
console.log("store: "+sess.store);

app.use(sess);

app.use(express.static('www'));

var bodyParser = require('body-parser');
app.use(bodyParser.json()); // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({extended: true})); // to support URL-encoded bodies

wss.on('error', err => {
    console.dir(err);
});

server.listen(8080, function () {
    console.log('Electron Builder Online Web Server listening on port 8080!');
});

var isProcessing = false;

function processList() {

    requests_historic.find({"processed": false, "aborted": false}, function (error, docs) {

        if ( error ) {
            console.log("Error:");
            console.log(error);
        } else {
        
            if ( docs.length > 0 && !isProcessing ) {

                isProcessing =  true;

                var minimist_parameters = minimist(docs[0]);
                var socket = null;
                for (var i = 0; i < sockets.length; i++) {
                    if ( sockets[i].parameters._id === docs[0]._id ) {
                        socket = sockets[i];
                        break;
                    }
                }

                socket.send(JSON.stringify({"op": "console_output", "message": "Starting to process your project!!!"}));

                console.log("minimist_parameters: ");
                console.log(minimist_parameters);

                var win_ready = true;
                if ( minimist_parameters.win === true ) {

                    win_ready = false;

                    var win_parameters = JSON.parse(JSON.stringify(minimist_parameters));

                    delete win_parameters.linux;
                    delete win_parameters.mac;

                    var ws_win = new WebSocket('ws://??????????:8080/');
                    ws_win.on('open', function open() {
                        socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Windows Builder.'}));
                        ws.send(JSON.stringify({'op': 'subscribe', 'parameters': docs[0]}));
                    });

                    ws_win.on('message', function incoming(win_data) {

                        win_data = JSON.parse(win_data);
                        if ( win_data.op === 'console_output' ) {

                            socket.send(JSON.stringify({"op": "console_output", "message": win_data.message.blue}));

                        }

                    });

                }
                
                var mac_ready = true;
                if ( minimist_parameters.mac === true ) {

                    mac_ready = false;

                    var mac_parameters = JSON.parse(JSON.stringify(minimist_parameters));

                    delete mac_parameters.win;
                    delete mac_parameters.linux;

                    var ws_mac = new WebSocket('ws://??????????:8080/');
                    ws_mac.on('open', function open() {
                        socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Mac Builder.'}));
                        ws.send(JSON.stringify({'op': 'subscribe', 'parameters': docs[0]}));
                    });

                    ws_mac.on('message', function incoming(mac_data) {

                        mac_data = JSON.parse(mac_data);
                        if ( mac_data.op === 'console_output' ) {

                            socket.send(JSON.stringify({"op": "console_output", "message": mac_data.message.red}));

                        }

                    });

                }
                
                var linux_ready = true;
                if ( minimist_parameters.linux === true ) {

                    linux_ready = false;

                    var linux_parameters = JSON.parse(JSON.stringify(minimist_parameters));

                    delete linux_parameters.mac;
                    delete linux_parameters.linux;

                    var ws_linux = new WebSocket('ws://??????????:8080/');
                    ws_linux.on('open', function open() {
                        socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Linux Builder.'}));
                        ws.send(JSON.stringify({'op': 'subscribe', 'parameters': docs[0]}));
                    });

                    ws_linux.on('message', function incoming(linux_data) {

                        linux_data = JSON.parse(linux_data);
                        if ( linux_data.op === 'console_output' ) {

                            socket.send(JSON.stringify({"op": "console_output", "message": linux_data.message.yellow}));

                        }

                    });

                }

                setInterval(function () {

                    if ( win_ready && mac_ready && linux_ready ) {

                        socket = null;

                        requests_historic.update({_id: docs[0]._id}, {$set: {processed: true}}, {multi: false}, function (error, docs) {
                        
                            // Mark as ready on database
                            socket.send(JSON.stringify({"op": "console_output", "message": 'Congratulations! Your job has completed!'}));
                        
                        });

                    }

                }, 1000);

            }

        }

    });

}

setInterval(function () {
    processList()
}, 1000);

wss.on('connection', (socket, req) => {

    console.log('WebSocket client connected...');
    sess(req, {}, () => {
        console.log('Session is parsed!');
    });

    socket.on('error', err => {
        console.dir(err);
    });

    socket.on('message', data => {
        
        data = JSON.parse(data);

        console.log("received message: ");
        console.log(data);

        if ( data.op === 'subscribe' ) {

            var parameters = JSON.parse(req.body.parameters);
            parameters.processed = false;
            parameters.requisition_time = (new Date()).getTime();

            // Store on nedb project information to process when compiler is unocupied
            requests_historic.insert(obj, function (error, newDoc) {

                if ( error ) {
                    console.log("Error:");
                    console.log(error);
                }

                socket.parameters = newDoc;

                sockets.push(socket);
                
                socket.send(JSON.stringify({"op": "returned_subscribe", "status": true, "subscription": newDoc._id}));

            });

        } else if ( data.op === 'getQueueSize' ) {

            requests_historic.find({processed: false}, function (error, docs) {
                if ( error ) {
                    console.log("Error:");
                    console.log(error);
                } else {
                    socket.send(JSON.stringify({"op": "returned_getQueueSize", "size": docs.length}));
                }
            });

        }

    });

    socket.on('close', () => {

        // Eliminates socket from sockets array
        

        console.log('Socket closed');

    });

});

wss.on('listening', () => {
    console.log('Listening...');
});

// -----Web Socket (END) --------------------

server.listen(confs.mirror_server, function () {
    console.log('IPFSSyncro Web Server listening on port '+confs.mirror_server+'!');
});