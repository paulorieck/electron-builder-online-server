#!/usr/bin/env node

const os = require("os");

if ( os.platform() === "win32" ) {

  const {exec} = require('child_process');

  const electron = exec("node "+__dirname+"/electron-builder-online-server.js");

  electron.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
  });

  electron.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  electron.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });

} else if ( os.platform() === "darwin" || os.platform() === "linux" ) {

  const {spawn} = require('child_process');

  var args = [__dirname+"/electron-builder-online-server.js"];

  const options = {
    cwd: __dirname,
    spawn: false
  }

  const electron = spawn("node", args, options);

  electron.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
  });

  electron.stderr.on('data', (data) => {
    console.log(`stderr: ${data}`);
  });

  electron.on('close', (code) => {
    console.log(`child process exited with code ${code}`);
  });

}

