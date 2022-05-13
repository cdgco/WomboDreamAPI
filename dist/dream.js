const axios = require('axios').default;
const { printTable } = require('console-table-printer');
const Authentication = require('./auth');

function defineHeaders(token, type = "text/plain;charset=UTF-8") {
    return {
        'Origin': 'https://app.wombo.art',
        'Referer': 'https://app.wombo.art/',
        'Authorization': 'bearer ' + token,
        'Content-Type': type,
        'service': 'Dream'
    };
}

const getStyles = () => {
    return new Promise(function(resolve, reject) {
        axios.get('https://app.wombo.art/api/styles')
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const printStyles = async() => {
    let styles = await getStyles();
    styles.forEach(style => {
        delete style.is_visible;
        delete style.created_at;
        delete style.updated_at;
        delete style.deleted_at;
    });
    styles.sort((a, b) => (a.id > b.id) ? 1 : -1)
    printTable(styles);
}

const getTaskID = (token) => {
    return new Promise(function(resolve, reject) {
        axios.post('https://app.wombo.art/api/tasks', '{ "premium": false }', {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data.id);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const getTaskShopURL = (token, taskID) => {
    return new Promise(function(resolve, reject) {
        axios.get('https://app.wombo.art/api/shop/' + taskID, {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const getUploadURL = async(token = null) => {
    if (token == null) {
        token = await Authentication.signUp();
        token = token.idToken;
    }
    return new Promise(function(resolve, reject) {
        axios.post('https://mediastore.api.wombo.ai/io/', {
                "media_expiry": "HOURS_72",
                "media_suffix": "jpeg",
                "num_uploads": 1
            }, {
                headers: defineHeaders(token, "application/json")
            })
            .then(function(response) {
                resolve(response.data[0]);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const uploadPhoto = async(imageBuffer, token = null) => {
    if (token == null) {
        token = await Authentication.signUp();
        token = token.idToken;
    }
    let URL = await getUploadURL(token);
    return new Promise(function(resolve, reject) {
        axios.put(URL.media_url, imageBuffer, {
                headers: {
                    'Content-Type': 'image/jpeg',
                    'Content-Length': imageBuffer.length,
                },
            })
            .then(function(response) {
                resolve(URL.id);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

// Using the new task ID, supply a prompt and start the image generation process.
const createTask = (token, taskID, prompt, style, imageId = null, weight = "MEDIUM") => {
    if (weight != "LOW" && weight != "MEDIUM" && weight != "HIGH") {
        weight = "MEDIUM";
    }
    var jsonData = {
        "input_spec": {
            "prompt": prompt,
            "style": style,
            "display_freq": 10
        }
    };
    if (imageId != null) {
        jsonData.input_spec.input_image = {
            "mediastore_id": imageId,
            "weight": weight
        }
    }

    return new Promise(function(resolve, reject) {
        axios.put('https://app.wombo.art/api/tasks/' + taskID, jsonData, {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error.response.data);
            });
    });
}

// Check the status of the task. This function returns all data including progress photos and result.
const checkStatus = (token, taskID) => {
    return new Promise(function(resolve, reject) {
        axios.get('https://app.wombo.art/api/tasks/' + taskID, {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

// User account must have username set in order to save
const saveToGallery = async(token, taskID, settings = { "name": "", "public": false, "visible": true }) => {
    if (settings == null) {
        settings = { "name": "", "public": false, "visible": true };
    }
    return new Promise(function(resolve, reject) {
        axios.post('https://app.wombo.art/api/gallery/', {
                "task_id": taskID,
                "name": settings.name,
                "is_public": settings.public,
                "is_prompt_visible": settings.visible
            }, {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const getGallery = (token) => {
    return new Promise(function(resolve, reject) {
        axios.get('https://app.wombo.art/api/gallery/', {
                headers: defineHeaders(token)
            })
            .then(function(response) {
                resolve(response.data);
            })
            .catch(function(error) {
                resolve(error);
            });
    });
}

const generateImage = async(style, promptValue, token = null, image = null, weight = "MEDIUM", save = false, saveSettings = { "name": "", "public": false, "visible": true }, callback) => {
    if (token == null) {
        token = await Authentication.signUp();
        token = token.idToken;
        save = false;
    }
    let taskID = await getTaskID(token); // Get the task ID
    if (weight != "LOW" && weight != "MEDIUM" && weight != "HIGH") {
        weight = "MEDIUM";
    }
    if (image != null) {
        let imageId = await uploadPhoto(image, token);
        var task = await createTask(token, taskID, promptValue, style, imageId, weight); // Create the task
    }
    else {
        var task = await createTask(token, taskID, promptValue, style, image, weight); // Create the task
    }
    if (callback && typeof callback === 'function') {
        callback(task);
    }
    else {
        console.log("creating task...");
    }    
    var status = { "state": "generating" }; // Set the default status to generating
    var result;
    while (status.state == "generating" || status.state == "input" || status.state == "pending") { // While the task is still generating
        result = await checkStatus(token, taskID); // Get the latest status
        status.state = result.state; // Set the status to the current state and exit loop
        if (status.state != "completed" && status.state != "failed") {
            if (callback && typeof callback === 'function') {
                callback(result);
            }
            else {
                console.log("generating...");
            }
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (save) {
        await saveToGallery(token, taskID, saveSettings); // Save the task to the gallery
    }
    return result
}

exports.getStyles = getStyles;
exports.printStyles = printStyles;
exports.getTaskID = getTaskID;
exports.getUploadURL = getUploadURL;
exports.uploadPhoto = uploadPhoto;
exports.createTask = createTask;
exports.checkStatus = checkStatus;
exports.generateImage = generateImage;
exports.getTaskShopURL = getTaskShopURL;
exports.saveToGallery = saveToGallery;
exports.getGallery = getGallery;