const express = require('express');
const router = express.Router();
const passport = require('passport');
const Student = require("../../models/student");
const Teacher = require("../../models/teacher");

router.get('/register', (req, res) => {
    res.render('register')
})

router.post('/register', async (req, res) => {
    try{
        console.log('in register route req.body is ', req.body);
        const {name, username, password, userType} = req.body;
        if (userType === "student"){
            const user = new Student({name, username});
            const registeredStudent = await Student.register(user, password);
            req.login(registeredStudent, err => {
                if (err) return next(err);
                console.log(registeredStudent);
            res.redirect("/student");
            })
        } else if (userType === "professor"){
            const user = new Teacher({name, username});
            const registeredTeacher = await Teacher.register(user, password);
            req.login(registeredTeacher, err => {
                if (err) return next(err);
                console.log(registeredTeacher);
            res.redirect("/teacher");
            })
        }
               
    } catch (e) {
        console.log(e);
        res.redirect("/register")
    }
  
})

router.get("/login", (req, res) => {
    res.render("login");
})

router.get("/logout", (req, res) => {
    req.logout();
    res.redirect("/");
})

router.post("/login", passport.authenticate('local', {failureRedirect: '/login'}), (req, res, next) => {
    console.log("in login route req.user is ", req.user);
   const redirectUrl = req.session.returnTo || '/';
    
    delete req.session.returnTo;
    res.redirect(redirectUrl);
})

module.exports = router;