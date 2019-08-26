const express = require("express");
const session = require('express-session');
const minimist = require('minimist');
const os = require('os');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('colors');

const Datastore = require('nedb');
const requests_historic = new Datastore({filename: path.join(os.homedir(), '.electron-builder-online', 'nedb', 'requests_history.db'), autoload: true});
const emails = new Datastore({filename: path.join(os.homedir(), '.electron-builder-online', 'nedb', 'emails.db'), autoload: true});

var NedbStore = require('nedb-session-store')(session);

var app = express();

const http = require('http');
const WebSocket = require('ws');
const WebSocketServer = WebSocket.Server;

var server = http.createServer(app);
const wss = new WebSocketServer({server});

var session_conf = 
{
    secret: 'electron-builder-online_h6cg89rjdfl0x8',
    cookie:{
        maxAge: 3600000
    },
    store: new NedbStore({
        filename: path.join(os.homedir(), '.electron-builder-online', 'nedbs', 'sessions.db')
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

var sockets = [];

var isProcessing = false;

function processList() {

    console.log("Checking for job to process...");

    requests_historic.find({"processed": false, "aborted": false}, function (error, docs) {

        console.log("processList ==> Queue to processs:");
        console.log(docs);

        if ( error ) {
            console.log("Error:");
            console.log(error);
        } else {
        
            if ( docs.length > 0 && !isProcessing ) {

                isProcessing =  true;

                var socket = null;
                for (var i = 0; i < sockets.length; i++) {
                    if ( sockets[i].parameters._id === docs[0]._id ) {
                        socket = sockets[i];
                        break;
                    }
                }

                if ( socket === null ) {

                    // Abort
                    requests_historic.update({_id: docs[0]._id}, {$set: {aborted: true}}, {multi: false}, function (error, docs) {
                        isProcessing = false;
                    });

                } else {

                    if ( socket === null ) {

                        // Abort
                        requests_historic.update({_id: docs[0]._id}, {$set: {aborted: true}}, {multi: false}, function (error, docs) {
                            isProcessing = false;
                        });
                        
                    } else {

                        socket.send(JSON.stringify({"op": "console_output", "message": "Starting to process your project!!!"}));

                        console.log("docs[0]: ");
                        console.log(docs[0]);

                        var win_ready = true;
                        if ( docs[0].win === true ) {

                            win_ready = false;

                            var win_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete win_parameters.linux;
                            delete win_parameters.mac;

                            var ws_win = new WebSocket('ws://localhost:8006/');
                            ws_win.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Windows Builder.'}));
                                ws.send(JSON.stringify({'op': 'subscribe', 'parameters': win_parameters}));
                            });

                            ws_win.on('message', function incoming(win_data) {

                                win_data = JSON.parse(win_data);
                                if ( win_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": win_data.message.blue}));

                                } else if ( win_data.op === 'job_concluded' ) {

                                    if ( win_data.status === true ) {
                                        win_ready = true;
                                        win_ready.close();
                                    }

                                }

                            });

                        }
                        
                        var mac_ready = true;
                        if ( docs[0].mac === true ) {

                            mac_ready = false;

                            var mac_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete mac_parameters.win;
                            delete mac_parameters.linux;

                            var ws_mac = new WebSocket('ws://localhost:8007/');
                            ws_mac.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Mac Builder.'}));
                                ws.send(JSON.stringify({'op': 'subscribe', 'parameters': mac_parameters}));
                            });

                            ws_mac.on('message', function incoming(mac_data) {

                                mac_data = JSON.parse(mac_data);
                                if ( mac_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": mac_data.message.red}));

                                    if ( mac_data.message.blue.indexOf('Done') !== -1 ) {

                                        mac_ready = true;

                                        ws_mac.close();

                                    }

                                } else if ( win_data.op === 'job_concluded' ) {

                                    if ( win_data.status === true ) {
                                        win_ready = true;
                                        win_ready.close();
                                    }

                                }

                            });

                        }
                        
                        var linux_ready = true;
                        if ( docs[0].linux === true ) {

                            linux_ready = false;

                            var linux_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete linux_parameters.mac;
                            delete linux_parameters.linux;

                            var ws_linux = new WebSocket('ws://localhost:8005/');
                            ws_linux.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Linux Builder.'}));
                                ws.send(JSON.stringify({'op': 'subscribe', 'parameters': linux_parameters}));
                            });

                            ws_linux.on('message', function incoming(linux_data) {

                                linux_data = JSON.parse(linux_data);
                                if ( linux_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": linux_data.message.yellow}));

                                    if ( linux_data.message.blue.indexOf('Done') !== -1 ) {

                                        linux_ready = true;

                                        ws_linux.close();

                                    }

                                } else if ( win_data.op === 'job_concluded' ) {

                                    if ( win_data.status === true ) {
                                        win_ready = true;
                                        win_ready.close();
                                    }

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
        //console.log('Session is parsed!');
    });

    socket.on('error', err => {
        console.dir(err);
    });

    socket.on('message', data => {
        
        data = JSON.parse(data);

        if ( data.op === 'subscribe' ) {

            var parameters = data.parameters;
            parameters.processed = false;
            parameters.requisition_time = (new Date()).getTime();

            var minimist_parameters = minimist(parameters);

            console.log("Package URL: "+minimist_parameters.repository.replace("git+", "").replace(".git", "")+"/raw/master/package.json");
            axios.get(minimist_parameters.repository.replace("git+", "").replace(".git", "")+"/raw/master/package.json").then(function (package_) {

                package_ = package_.data;

                minimist_parameters = Object.assign(minimist_parameters, {"version": package_.version});

                delete minimist_parameters._;

                var valid = true;

                requests_historic.find({"repository": minimist_parameters.repository, "gh_token": minimist_parameters.gh_token, "version": minimist_parameters, "processed": false, "aborted": false}, function (error, docs) {

                    if ( docs.length === 0 ) {

                        if ( typeof minimist_parameters.email === "undefined" || minimist_parameters.email === null || minimist_parameters.email === "" ) {

                            socket.send(JSON.stringify({"op": "console_output", "message": "Error! You need to inform a valid email! --email='example@example.com'".red}));
                            valid = false;
            
                        } 
            
                        if ( typeof minimist_parameters.gh_token === "undefined" || minimist_parameters.gh_token === null || minimist_parameters.gh_token === "" ) {
            
                            socket.send(JSON.stringify({"op": "console_output", "message": "Error! You need to inform a valid email! --gh_token='XXXXXXXXXXXXXXX'".red}));
                            socket.send(JSON.stringify({"op": "console_output", "message": "Your GitHub tokens will not be stored!".yellow}));
                            valid = false;
            
                        }
                        
                        if ( valid ) {

                            // processed": false, "aborted": false
                            minimist_parameters.processed = false;
                            minimist_parameters.aborted = false;
            
                            // Store on nedb project information to process when compiler is unocupied
                            requests_historic.insert(minimist_parameters, function (error, newDoc) {
            
                                if ( error ) {
                                    console.log("Error:");
                                    console.log(error);
                                }

                                socket.send(JSON.stringify({"op": "console_output", "message": "Succesfully registered your job on queue!".yellow}));
            
                                socket.parameters = newDoc;
            
                                sockets.push(socket);
                                
                                socket.send(JSON.stringify({"op": "returned_subscribe", "status": true, "subscription": newDoc._id}));
            
                            });
            
                        }

                    } else {

                        socket.send(JSON.stringify({"op": "console_output", "message": "This version for the specified GitHub repository is already registered".yellow}));

                    }

                });

            }).catch(function (error) {
                // handle error
                console.log(error);
            }).finally(function () {
                // always executed
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

server.listen(8080, function () {
    console.log('Electron-builder-online-server Web Server listening on port 8080!');
});