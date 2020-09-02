const { getDeployVersion, uploadDist, patchDeployment, getRevisions, rollbackDeployment, getReplicas, setReplicas } = require('./k8s.js');
const { addImageTag, getGCRVersion } = require('./gcr.js');

const allowedServices = {
    "readr-cms": "openwarehouse-readr",
    "readr-nuxt": "readr-nuxt",
};

module.exports = function (robot) {
    robot.respond(/assemble/i, (msg) => {
        msg.send('I am Tarja');
    });

    robot.respond(/version\s+rrn\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const tagOnK8s = await getDeployVersion('default', deployName);
            getGCRVersion(deployName, tagOnK8s, (err, gcrVersion) => {
                if (err) throw err;
                msg.send(`${deployName} is using ${gcrVersion}`);
            });
        } catch (err) {
            msg.send(err);
        }
    });

    robot.respond(/deploy\s+rrn\s+([^\s]+)\s+(.+)/i, async (msg) => {
        msg.send('Launching deploy sequences');
        const deployName = msg.match[1];
        const versionTag = msg.match[2];

        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        if (versionTag.split(" ").length != 2) {
            return msg.send('Invalid deploy command. Should specify the deploy version tag. \n e.g. deploy rr readr-restful dev_Falsechord_711 1.1.0')
        } else {
            const devTag = versionTag.split(" ")[0];
            const prodTag = versionTag.split(" ")[1];

            addImageTag(allowedServices[deployName], devTag, prodTag, (err, fullDevTag) => {
                if (err) {
                    console.log(err);
                    return msg.send(`Updating deployment ${deployName} error: ${err}`);
                } else {
                    msg.send(`The new tag ${prodTag} has been set to image ${fullDevTag}, ${deployName} will update in a few minutes @here `);
                }
            });
        }
    });

    robot.respond(/revisions\s+rrn\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const revisions = await getRevisions('default', deployName);
            msg.send(`*${deployName}* revisions:\n${revisions.join('\n')}`);
        } catch (error) {
            console.log(err);
            msg.send(`error: ${err}`);
        }
    });

    robot.respond(/rollback\s+rrn\s+([^\s]+)\s+(\d+)/i, async (msg) => {
        const deployName = msg.match[1];
        const revision = msg.match[2];

        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const result = await rollbackDeployment('default', deployName, revision);
            msg.send(`${result}`);
        } catch (err) {
            console.log(err)
            msg.send(`error: ${err}`);
        }
    });

    robot.respond(/replicas\s+rrn\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const result = await getReplicas('default', deployName);
            msg.send(`${result}`);
        } catch (err) {
            console.log(err)
            msg.send(`error: ${err}`);
        }
    });

    robot.respond(/scale\s+rrn\s+([^\s]+)\s+(\d+)\s+(\d+)/i, async (msg) => {
        const deployName = msg.match[1];
        const currentReplicas = msg.match[2];
        const assignedReplicas = msg.match[3];
        const matches = Object.keys(allowedServices).filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const result = await setReplicas('default', deployName, currentReplicas, assignedReplicas);
            msg.send(`${result}`);
        } catch (err) {
            console.log(err)
            msg.send(`error: ${err}`);
        }
    });
};

