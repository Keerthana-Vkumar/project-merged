const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
    group: {
        type: String,
        enum: ["group1", "group2"]
    },
    student1: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student'
    },
    student2: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Student'
    },
    quizScore: {
        type: Number,
        default: 0
        },
        timeTaken: {
            minutes: String,
            seconds: String
        },
        imageUrls: [
           {type: String}
        ],
        story: String
})

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;