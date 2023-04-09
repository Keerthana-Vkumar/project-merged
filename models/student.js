const mongoose = require("mongoose");
const passportLocalMongoose = require('passport-local-mongoose');

const studentSchema = new mongoose.Schema({
    username: String,
    name: String,
    individualScore: {
        type: Number,
        default: 0
    },
    timeTaken: String,
    userType: {
        type: String,
        default: "student",
        required: true
    },
    groupId: mongoose.Schema.Types.ObjectId
})

studentSchema.plugin(passportLocalMongoose);

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;