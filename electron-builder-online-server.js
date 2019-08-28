const express = require("express");
const session = require('express-session');
const minimist = require('minimist');
const os = require('os');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const cron = require('node-cron');
const prettyMilliseconds = require('pretty-ms');
require('colors');

const Datastore = require('nedb');
const requests_historic = new Datastore({filename: path.join(os.homedir(), '.electron-builder-online', 'nedbs', 'requests_history.db'), autoload: true});
const queues_size = new Datastore({filename: path.join(os.homedir(), '.electron-builder-online', 'nedbs', 'queues_size.db'), autoload: true});
const emails = new Datastore({filename: path.join(os.homedir(), '.electron-builder-online', 'nedbs', 'emails.db'), autoload: true});

var confs = {};

if ( !fs.existsSync(path.join(os.homedir(), '.electron-builder-online')) ) {
    fs.mkdirSync(path_module.join(homedir, ".electron-builder-online"));
}

if ( fs.existsSync(path.join(os.homedir(), '.electron-builder-online', 'configs.json')) ) {

    confs = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.electron-builder-online', 'configs.json')));

    if ( typeof confs.linux_address === "undefined" ) {
        confs.linux_address = "localhost:8005";
    }

    if ( typeof confs.win_address === "undefined" ) {
        confs.win_address = "localhost:8006";
    }

    if ( typeof confs.mac_address === "undefined" ) {
        confs.mac_address = "localhost:8007";
    }

} else {

    confs = {"linux_address": "localhost:8005", "win_address": "localhost:8006", "mac_address": "localhost:8007"};

}
fs.writeFileSync(path.join(os.homedir(), '.electron-builder-online', 'configs.json'), JSON.stringify(confs));

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

function processColor(message, ws, socket, this_system, this_color, callback) {

    var c1, c2, c3, c4

    c1 = parseFloat(message.charAt(message.length()-1));
    try {
        c2 = parseFloat(message.charAt(message.length()-2));
        try {
            c3 = parseFloat(message.charAt(message.length()-3));
        } catch (Err) {}
        try {
            c4 = parseFloat(message.charAt(message.length()-4));
        } catch (Err) {}
    } catch (Err) {}
    
    var code = "";
    if ( typeof c1 !== "undefined" ) {
        code = c1+code;
    }

    if ( typeof c2 !== "undefined" ) {
        code = c2+code;
    }

    if ( typeof c3 !== "undefined" ) {
        code = c3+code;
    }

    if ( typeof c4 !== "undefined" ) {
        code = c4+code;
    }

    code = parseFloat(code);

    if ( code !== 0 ) {

        callback(true);
        ws.close();

        socket.send(JSON.stringify({"op": "console_output", "message": "Error while processing job on "+this_system+"!".this_color}));
        
    } else {

        callback(false);

    }

}

function processList() {

    requests_historic.find({"processed": false, "aborted": false}, function (error, docs) {

        if ( error ) {
            console.log("Error:");
            console.log(error);
        } else {
        
            if ( docs.length > 0 ) {

                isProcessing =  true;

                var socket = null;
                for (var i = 0; i < sockets.length; i++) {
                    if ( sockets[i].parameters._id === docs[0]._id ) {
                        socket = sockets[i];
                        break;
                    }
                }

                var start_time = (new Date()).getTime();

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

                        var win_ready = true;
                        if ( docs[0].win === true ) {

                            win_ready = false;

                            var this_system = "Windows";
                            var this_color = blue;

                            var win_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete win_parameters.linux;
                            delete win_parameters.mac;

                            var ws_win = new WebSocket('ws://'+confs.win_address+'/');
                            ws_win.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Windows Builder.'}));
                                ws_win.send(JSON.stringify({'op': 'subscribe', 'parameters': win_parameters}));
                            });

                            ws_win.on('message', function incoming(win_data) {

                                win_data = JSON.parse(win_data);
                                if ( win_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": win_data.message.this_color}));

                                    if ( win_data.message.indexOf('Done') !== -1 ) {

                                        win_ready = true;
                                        ws_win.close();

                                    } else if ( win_data.message.indexOf("exited with code") !== 1 ) {

                                        processCode(win_data.message, ws_win, socket, this_system, this_color, function (win_ready_) {
                                            win_ready = win_ready_;
                                        });

                                    }

                                } else if ( win_data.op === 'job_concluded' ) {

                                    if ( win_data.status === true ) {
                                        win_ready = true;
                                        ws_win.close();
                                    }

                                }

                            });

                        }
                        
                        var mac_ready = true;
                        if ( docs[0].mac === true ) {

                            mac_ready = false;

                            var this_system = "MAC OS X";
                            var this_color = red;

                            var mac_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete mac_parameters.win;
                            delete mac_parameters.linux;

                            var ws_mac = new WebSocket('ws://'+confs.mac_address+'/');
                            ws_mac.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Mac Builder.'}));
                                ws_mac.send(JSON.stringify({'op': 'subscribe', 'parameters': mac_parameters}));
                            });

                            ws_mac.on('message', function incoming(mac_data) {

                                mac_data = JSON.parse(mac_data);
                                if ( mac_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": mac_data.message.this_color}));

                                    if ( mac_data.message.indexOf('Done') !== -1 ) {

                                        mac_ready = true;
                                        ws_mac.close();

                                    } else if ( mac_data.message.indexOf("exited with code") !== 1 ) {

                                        processCode(mac_data.message, ws_mac, socket, this_system, this_color, function (mac_ready_) {
                                            mac_ready = mac_ready_;
                                        });

                                    }

                                } else if ( mac_data.op === 'job_concluded' ) {

                                    if ( mac_data.status === true ) {
                                        mac_ready = true;
                                        ws_mac.close();
                                    }

                                }

                            });

                        }
                        
                        var linux_ready = true;
                        if ( docs[0].linux === true ) {

                            linux_ready = false;

                            var this_system = "Linux";
                            var this_color = yellow;

                            var linux_parameters = JSON.parse(JSON.stringify(docs[0]));

                            delete linux_parameters.mac;
                            delete linux_parameters.linux;

                            var ws_linux = new WebSocket('ws://'+confs.linux_address+'/');
                            ws_linux.on('open', function open() {
                                socket.send(JSON.stringify({"op": "console_output", "message": 'WebSocket opened to Linux Builder.'}));
                                ws_linux.send(JSON.stringify({'op': 'subscribe', 'parameters': linux_parameters}));
                            });

                            ws_linux.on('message', function incoming(linux_data) {

                                linux_data = JSON.parse(linux_data);
                                if ( linux_data.op === 'console_output' ) {

                                    socket.send(JSON.stringify({"op": "console_output", "message": linux_data.message.this_color}));

                                    if ( linux_data.message.blue.indexOf('Done') !== -1 ) {

                                        linux_ready = true;
                                        ws_linux.close();

                                    } else if ( linux_data.message.indexOf("exited with code") !== 1 ) {

                                        processCode(linux_data.message, ws_linux, socket, this_system, this_color, function (linux_ready_) {
                                            linux_ready = linux_ready_;
                                        });

                                    }

                                } else if ( linux_data.op === 'job_concluded' ) {

                                    if ( linux_data.status === true ) {
                                        linux_ready = true;
                                        ws_linux.close();
                                    }

                                }

                            });

                        }

                        setInterval(function () {

                            if ( win_ready && mac_ready && linux_ready ) {

                                var time_to_proccess_job = (new Date()).getTime() - start_time;

                                requests_historic.update({_id: docs[0]._id}, {$set: {"processed": true, "time_to_proccess_job": time_to_proccess_job}}, {multi: false}, function (error, docs) {
                                
                                    // Mark as ready on database
                                    socket.send(JSON.stringify({"op": "console_output", "message": 'Congratulations! Your job has completed! It took '+(prettyMilliseconds(time_to_proccess_job))+' seconds to run.'}));

                                    isProcessing = false;

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
    if ( !isProcessing ) {
        processList();
    }
}, 1000);

cron.schedule('0,10,20,30,40,50 * * * * *', () => {
    
    getQueueSize(function (docslength) {
        if ( docslength !== 0 ) {
            queues_size.insert({"time": Math.round((new Date()).getTime()/1000), "l": docslength});
        }
    });

});

function getQueueSize(callback) {

    requests_historic.find({"processed": false, "aborted": false}, function (error, docs) {
        if ( error ) {
            console.log("Error:");
            console.log(error);
        } else {
            callback(docs.length);
        }
    });

}

app.post('/getLast5MinutesQueues', function (req, res) {

    var init = (new Date()).getTime()-(60*60*1000);
    queues_size.find({"time": {$gt: init}}, function (error, docs) {
        res.send(docs);
    });
    
});

app.post('/getLastQueueNumber', function (req, res) {

    var init = (new Date()).getTime()-(10*1000);
    queues_size.find({"time": {$gt: init}}, function (error, docs) {
        res.send(docs[0]);
    });
    
});

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

            axios.get(minimist_parameters.repository.replace("git+", "").replace(".git", "")+"/raw/master/package.json").then(function (package_) {

                package_ = package_.data;

                minimist_parameters = Object.assign(minimist_parameters, {"version": package_.version, "name": package_.name});

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

                        if ( typeof minimist_parameters.install_with === "undefined" || minimist_parameters.install_with === null || minimist_parameters.install_with === "" ) {
                            minimist_parameters.install_with = "yarn";
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

            getQueueSize(function (docslength) {
                socket.send(JSON.stringify({"op": "returned_getQueueSize", "size": docslength}));
            });

        }

    });

    socket.on('close', () => {

        // Eliminates socket from sockets array
        console.log('Socket closed');

        for (var i = 0; i < sockets.length; i++) {
            if ( sockets[i].parameters._id === socket.parameters._id ) {
                sockets.splice(i,1);
                socket = null;
                break;
            }
        }

    });

});

wss.on('listening', () => {
    console.log('Listening...');
});

// -----Web Socket (END) --------------------

server.listen(8080, function () {
    console.log('Electron-builder-online-server Web Server listening on port 8080!');
});