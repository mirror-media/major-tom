const {getDeployVersion, uploadDist, patchDeployment} = require('./k8s.js');

module.exports = function(robot) {
    robot.respond(/assemble/i, (msg) => {
        msg.send('I am Tom');
    });

    robot.respond(/version\s+mm\s+(plate-vue-mobile|plate-vue|tr-projects-rest|tr-projects-app)/i, async (msg) => {
        const deployName = msg.match[1];

        try {
            const version = await getDeployVersion('default', deployName);
            msg.send(`${deployName} is using ${version}`);
        } catch (err) {
            msg.send(err);
        }
    });

    robot.respond(/deploy\s+mm\s+(plate-vue-mobile|tr-projects-rest|plate-vue|tr-projects-app)\s+(.+)/i, async (msg) => {
        msg.send('launching deploy sequences');
        const deployName = msg.match[1];
        const isBackend = deployName.startsWith('tr-projects');
        const repoName = isBackend ? 'tr-projects-rest' : deployName;
        const fullImage = `gcr.io/mirrormedia-1470651750304/${repoName}:${msg.match[2]}`;
        const canaryName = `${deployName}-canary`;
        const deploymentList = [];

        if (!isBackend) {
            deploymentList.push(deployName);
            msg.send('dists uploading ... ');
            try {
                await uploadDist('dist', canaryName, fullImage, 'dist');
                msg.send('dist uploaded.');
            } catch (err) {
                msg.send(err);
            }
        } else {
            deploymentList.push('tr-projects-rest', 'tr-projects-app');
        }

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
                msg.send(`${deploymentList} updated`);
            }
        } catch (err) {
            msg.send(`Update deployment ${deployName} error: `, err);
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

