const { getDeployVersion, uploadDist, patchDeployment, getRevisions, rollbackDeployment } = require('./k8s.js');
const { addImageTag, getGCRVersion } = require('./gcr.js');

const allowedServices = [
    "readr-site-mobile",
    "readr-site",
    "news-projects",
    "news-projects-canary",
    "readr-restful"
];

module.exports = function (robot) {
    robot.respond(/assemble/i, (msg) => {
        msg.send('I am Tor');
    });

    robot.respond(/version\s+rr\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
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

    robot.respond(/deploy\s+rr\s+([^\s]+)\s+(.+)/i, async (msg) => {
        msg.send('Launching deploy sequences');
        const deployName = msg.match[1];
        const versionTag = msg.match[2];
        const isFrontend = deployName !== 'readr-restful';

        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        const fullImage = 'gcr.io/mirrormedia-1470651750304/' + deployName + ':' + versionTag;

        // Check if version in the pattern master*
        if (isFrontend) {
            if (!versionTag.startsWith('master')) {
                return msg.send('Invalid version. news-projects version should start with master');
            }
        } else {
            if (versionTag.split(" ").length != 2) {
                return msg.send('Invalid deploy command. Should specify the deploy version tag. \n e.g. deploy rr readr-restful dev_Falsechord_711 1.1.0')
            }
        }

        if (isFrontend) {
            try {
                await patchDeployment('default', deployName, {
                    body: {
                        spec: {
                            template: {
                                spec: {
                                    containers: [{
                                        name: deployName,
                                        image: fullImage,
                                    }],
                                },
                            },
                        },
                    },
                });
                msg.send(`${deployName} updated`);
            } catch (err) {
                msg.send(`Update deployment ${deployName} error: `, err);
            }
        } else {
            const devTag = versionTag.split(" ")[0];
            const prodTag = versionTag.split(" ")[1];

            addImageTag(deployName, devTag, prodTag, (err, fullDevTag) => {
                if (err) {
                    console.log(err);
                    return msg.send(`Updating deployment ${deployName} error: ${err}`);
                } else {
                    msg.send(`The new tag ${prodTag} has been set to image ${fullDevTag}, ${deployName} will update in a few minutes`);
                }
            });
        }
    });

    robot.respond(/upload\s+dist\s+rr\s+(readr-site-mobile|readr-site|news-projects)\s+(.+)/i, async (msg) => {
        const deployName = msg.match[1];
        const fullImage = 'gcr.io/mirrormedia-1470651750304/' + deployName + ':' + msg.match[2];
        const canaryName = `${deployName}-canary`;
        let distribution;

        switch (deployName) {
            case 'readr-site-mobile':
                distribution = 'distribution';
                break;
            case 'readr-site':
                distribution = 'distribution';
                break;
            case 'news-projects':
                distribution = 'dist';
                break;
        }
        try {
            await uploadDist('dist', canaryName, fullImage, distribution);
            msg.send('dist uploaded.');
        } catch (err) {
            msg.send(err);
        }
    });

    robot.respond(/revisions\s+rr\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const revisions = await getRevisions('default', deployName);
            msg.send(`*${deployName}* revisions:\n${revisions.join('\n')}`);
        } catch (error) {
            msg.send('No revisions.');
        }
    });

    robot.respond(/rollback\s+rr\s+([^\s]+)\s+(\d+)/i, async (msg) => {
        const deployname = msg.match[1];
        const revision = msg.match[2];

        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const result = await rollbackDeployment('default', deployName, revision);
            msg.send(`${result}`);
        } catch (err) {
            msg.send(err);
        }
    });
};

