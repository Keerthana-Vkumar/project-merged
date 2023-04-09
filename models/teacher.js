const mongoose = require("mongoose");
const passportLocalMongoose = require('passport-local-mongoose');

const teacherSchema = new mongoose.Schema({
    name :String,
    username: String,
    userType: {
        type: String,
        default: "professor",
        required: true
    }
})

teacherSchema.plugin(passportLocalMongoose);

const Teacher = mongoose.model('Teacher', teacherSchema);

module.exports = Teacher;