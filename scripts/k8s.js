require('dotenv').config();

const cacrtPath = process.env.CERT_PATH
const tokenPath = process.env.TOKEN_PATH
const apiUrl = process.env.HUBOT_CLUSTER === "mirrormedia" ? process.env.MIRROR_K8S_SERVER : process.env.READR_K8S_SERVER

const Client = require('kubernetes-client').Client
const fs = require("fs")
const client = new Client({ config:{
    url: apiUrl,
    ca: fs.readFileSync(cacrtPath).toString(),
    auth: {
        bearer: fs.readFileSync(tokenPath).toString(), 
    },
    timeout: 1500 
} , version: '1.9' })

function osCmd(command, arguments) {
    const
      { spawnSync } = require( 'child_process'),
      cmd = spawnSync(command, arguments)
      console.log( `kubectl result: stdout: ${cmd.stdout.toString()}` ) 
      console.log( `kubectl result: stderr: ${cmd.stderr.toString()}` )   
}

module.exports = {
    client,
    osCmd
}