/* require('dotenv').config();

const GCP_KEYFILE = process.env.GCP_KEYFILE;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID; */

const { exec } = require('child_process');

const addImageTag = async (deployName, partialDevTag, prodTag, callback) => {
    /* The new prodTag should be greater than any existing prodTag in desc lexicographic order.
    Besides, one image can only have one prodTag, or the filter won't work properly due to its limited functionality. */
    console.log("exec", `gcloud container images list-tags --filter="tags~^\\d.*$ AND NOT tags<${prodTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`)
    exec(`gcloud container images list-tags --filter="tags~^\\d.*$ AND NOT tags<${prodTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`, (err, stdout, stderr) => {
        if (err) return callback(err);
        if (stdout.split("\n").length > 1) return callback("Version can only be increased");

        console.log("exec", `gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`);
        exec(`gcloud container images list-tags --filter="tags:*${partialDevTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`, (err, stdout, stderr) => {
            if (err) return callback(err);
            if (stdout.split("\n").length < 2) return callback("No such image");

            // Get devTag from buffered `stdout`
            devTag = stdout.split("\n")[1];

            console.log(`gcloud container images add-tag gcr.io/mirrormedia-1470651750304/${deployName}:${devTag} gcr.io/mirrormedia-1470651750304/${deployName}:${prodTag}`)
            exec(`gcloud -q container images add-tag gcr.io/mirrormedia-1470651750304/${deployName}:${devTag} gcr.io/mirrormedia-1470651750304/${deployName}:${prodTag}`, (err, stdout, stderr) => {
                if (err) return callback(err);

                return callback(null, devTag);
            });
        });
    });
}

const getGCRTags = async (deployName, devTag, callback) => {
    console.log("exec", `gcloud container images list-tags --filter="tags=${devTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`);
    exec(`gcloud container images list-tags --filter="tags=${devTag}" --format="csv(tags)" gcr.io/mirrormedia-1470651750304/${deployName}`, (err, stdout, stderr) => {
        if (err) return callback(err);

        const rets = stdout.split("\n");
        if (rets.length > 0) {
            const tags = rets[1].replace(/"/g, '').split(',');
            const gitOpsProdTags = tags.sort().reverse().join(', ');
            return callback(null, `[${gitOpsProdTags}]`);
        }

        return callback(null, `[${devTag}]`);
    });
}

module.exports = {
    addImageTag,
    getGCRTags
};
