const { getDeployVersion, uploadDist, patchDeployment } = require('./k8s.js');
const { addImageTag, attachGitOpsProdTag } = require('./gcr.js');

const allowedServices = [
    "plate-vue-mobile",
    "plate-vue",
    "tr-projects-rest",
    "tr-projects-app",
    "mirror-media-nuxt"
];

module.exports = function (robot) {
    robot.respond(/assemble/i, (msg) => {
        msg.send('I am Tom');
    });

    robot.respond(/version\s+mm\s+([^\s]+)/i, async (msg) => {
        const deployName = msg.match[1];
        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        try {
            const version = await getDeployVersion('default', deployName);
            attachGitOpsProdTag(deployName, version, (err, gitOpsVersion) => {
                if (err) throw err;
                version = gitOpsVersion;
                msg.send(`${deployName} is using ${version}`);
            });
        } catch (err) {
            msg.send(err);
        }
    });

    robot.respond(/deploy\s+mm\s+([^\s]+)\s+(.+)/i, async (msg) => {
        msg.send('launching deploy sequences');
        const deployName = msg.match[1];
        const versionTag = msg.match[2];
        const isBackend = deployName.startsWith('tr-projects');
        const repoName = isBackend ? 'tr-projects-rest' : deployName;
        const fullImage = `gcr.io/mirrormedia-1470651750304/${repoName}:${msg.match[2]}`;
        const deploymentList = [];

        const matches = allowedServices.filter(s => s === deployName.toLowerCase());
        if (matches.length == 0) return msg.send(`${deployName} is not on allowed list`);

        if (deployName !== "mirror-media-nuxt") {
            if (!isBackend) {
                deploymentList.push(deployName);
                // Check if frontend image tag starts with "master"
                if (!versionTag.startsWith('master')) {
                    return msg.send(`invalid version. ${deployName} version should start with master`);
                }
            } else {
                deploymentList.push('tr-projects-rest', 'tr-projects-app');
            }

            console.log(`updating deployment list ${deploymentList} with ${fullImage}`);
            try {
                for (let i = 0; i < deploymentList.length; i++) {
                    await patchDeployment('default', deploymentList[i], {
                        body: {
                            spec: {
                                template: {
                                    spec: {
                                        containers: [{
                                            name: deploymentList[i],
                                            image: fullImage,
                                        }],
                                    },
                                },
                            },
                        },
                    });
                    msg.send(`deployment ${deployName} updated`);
                }
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

    robot.respond(/upload\s+dist\s+mm\s+(plate-vue-mobile|plate-vue)\s+(.+)/i, async (msg) => {
        const deployName = msg.match[1];
        const repoName = (deployName === 'tr-projects-rest') ? 'mirrormedia-rest' : deployName;
        const fullImage = `gcr.io/mirrormedia-1470651750304/${repoName}:${msg.match[2]}`;
        const canaryName = `${deployName}-canary`;

        try {
            await uploadDist('dist', canaryName, fullImage, 'dist');
            msg.send('dist uploaded.');
        } catch (err) {
            msg.send(err);
        }
    });
};

