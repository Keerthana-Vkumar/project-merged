if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require("express");
const mongoose = require("mongoose");
const cors = require('cors');
const ejs = require("ejs");
const path = require('path');
const dotenv = require("dotenv");
const {Configuration, OpenAIApi} = require('openai');
const session = require('express-session');
const passport = require("passport");
const flash = require("connect-flash");
const LocalStrategy = require('passport-local');


dotenv.config();

const {isLoggedIn} = require("./middleware");

const Group = require('./models/group');
const Student = require('./models/student');
const Teacher = require("./models/teacher")

const dbUrl = process.env.DB_URL || 'mongodb://127.0.0.1:27017/whiteboard';
const MongoDBStore = require('connect-mongo');

const secret = process.env.SECRET || 'secret';

const app = express();

const store = MongoDBStore.create({
    mongoUrl: dbUrl,
    touchAfter: 24 * 60 * 60,
    secret
    })

store.on('error', function (e) {
    console.log("SESSION STORE ERROR", e);
})

const sessionConfig = {
    store,
    secret,
    resave: false,
    saveUninitialized: true,
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}

app.use(session(sessionConfig));

app.use(passport.initialize());
app.use(passport.session());


passport.use('studentLocal', new LocalStrategy(Student.authenticate()));
passport.use('teacherLocal', new LocalStrategy(Teacher.authenticate()))

passport.serializeUser(function(user, done) {
    done(null, user);
  });

passport.deserializeUser(function(user, done) {
    if(user!=null)
      done(null,user);
  });


mongoose.connect(dbUrl, {useNewUrlParser: true, useUnifiedTopology: true})
.then(() => {
    console.log('MONGO CONNECTION OPEN!!');
})
.catch((err) => {
    console.log("CONNECTION ERROR");
    console.log(err);
})

const db = mongoose.connection;
db.on('error', console.error)

app.use(cors());
app.use(express.json())
app.use(express.urlencoded({extended: true}))
app.use(flash());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '/views'));
app.use(express.static(path.join(__dirname, 'public')));


const http = require('http').Server(app);
const io = require('socket.io')(http)

let urls = [];
let connections = [];
let userConn = [];
let drawingData = [];

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(configuration);


app.use((req, res, next) => {
    const currentUser = req.user;
    res.locals.currentUser = currentUser;
    next();
})


app.get("/", (req, res) => {
    res.render('home');
}
);

app.get('/register', (req, res) => {
    res.render('register')
})

//Post route to handle registration of new user
app.post('/register', async (req, res) => {
    try{
        const {name, username, password, userType} = req.body;
        if (userType === "student"){
            const user = new Student({name, username});
            const registeredStudent = await Student.register(user, password);
            req.login(registeredStudent, err => {
                if (err) return next(err);
                
            res.redirect("/");
            })
        } else if (userType === "professor"){
            const user = new Teacher({name, username});
            const registeredTeacher = await Teacher.register(user, password);
            req.login(registeredTeacher, err => {
                if (err) return next(err);
                
            res.redirect("/teacher");
            })
        }

    } catch (e) {
        console.log(e);
        res.redirect("/register")
    }

})

app.get("/login", (req, res) => {
    res.render("login");
})

app.get("/logout", (req, res) => {
    req.logout()
    res.redirect("/")
})

// Post route to handle user login
app.post('/login', (req, res) => {
    console.log('login route')
    if (req.body.userType === 'student') {
        
        passport.authenticate('studentLocal')(req, res, function () {
            const redirectUrl = req.session.returnTo || '/'
            res.redirect("/");
          });


    } else if (req.body.userType === 'professor') {
        
        passport.authenticate('teacherLocal')(req, res, function () {
            const redirectUrl = req.session.returnTo || '/'
            res.redirect("/teacher");
          });
    }
})

// Route to render form to add new group
app.get("/group", isLoggedIn, async (req, res) => {
    let students = await Student.find({});
    const groups = (students.length / 2) + 1 ;
    res.render('addgroup', {groups});
})

// Post route handle adding new group
app.post("/group", isLoggedIn, async (req, res) => {
    const group = new Group(req.body);
    await group.save()
    res.redirect("/groups");
})

// Get route to render all the groups
app.get("/groups", isLoggedIn, async (req, res) => {
    const groups = await Group.find({});
    res.render("groups", {groups})
})

// Get route to render individual group details
app.get("/groups/:id", isLoggedIn, async (req, res) => {
    const group = await Group.findById(req.params.id).populate('student1').populate('student2');
    console.log('the group is ', group);
    res.render("showGroup", { group })
})

// Get route to render form to add students to group
app.get('/groups/:id/students/new', isLoggedIn, async (req, res) => {
    const students = await Student.find({});
    const { id } = req.params;
    res.render('addstudent', {id, students});
})

// Post route to handle addition of students to group
app.post("/groups/:id/students", isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const group = await Group.findById(id);
    const { student1, student2 } = req.body;
    const stud1 = await Student.findOne({ username: student1})
    const stud2 = await Student.findOne({ username: student2})
    group.student1 = stud1
    group.student2 = stud2
    await group.save()
    res.redirect('/groups');
    res.send(group);

})

// Post route to handle saving of image URLs array to database 
app.post("/rooms/:id/urls", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);

    try{
        const imageUrl = req.body.imageUrl;
        console.log('the image url is ',imageUrl)
        group.imageUrls.push(imageUrl);
        await group.save();
        res.redirect(`/rooms/${id}/story`);

    } catch (e) {
        console.log(e);
        res.status(500).send({e});
    }
})

// Get route to render page to review added image URLs and complete essay 
app.get("/rooms/:id/urls", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);
    res.render('urls', {group});
})

// Post route to save essay in database
app.post("/rooms/:id/urls/story", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);

    try{
        const story = req.body.story;
        group.story = story;
        await group.save();
        res.redirect('/finishedStory');
    } catch (e) {
        console.log(e);
        res.status(500).send({e});
    }
})

// Get route to render page after completing final round
app.get("/finishedStory", isLoggedIn, (req, res) => {
    res.render("finishedStory");
})

// Get route to display alloted group 
app.get("/rooms", isLoggedIn, async (req, res) => {
     if(req.user.userType === "student"){        
            const group = await Group.findOne({ $or: [{ student1: req.user._id}, { student2: req.user._id}]});
            res.render('rooms.ejs', {group});                
     }     
 })

 // Get route to display home page if user is a student
app.get("/student", isLoggedIn, (req, res) => {
    res.render("student.ejs")
})

// Get route to display home page if user is a teacher
app.get("/teacher", isLoggedIn, async (req, res) => {
    console.log('calling teacher')
    let totalStudents = []
    let realStudents = await Student.find();
    for (let student of realStudents){
        totalStudents.push(student)
    }

    console.log('total students ', totalStudents);

    let allStudents = []
    const allGroups = await Group.find();
 
    for(let group of allGroups){
        console.log('group is ', group)
        allStudents.push(group.student1)
        allStudents.push(group.student2)
    }
    console.log(allStudents);

    console.log('Length of groups ', allStudents.length);
    console.log('Length of total students ', totalStudents.length);

    const remainingStudents = totalStudents.length - allStudents.length;

    res.render("teacher.ejs", {totalStudents, allStudents});
})


// Get route to display page if quiz has timed out
app.get("/rooms/:id/timer", async (req, res) => {
    const group = await Group.findById(req.params.id);
    res.render("timer.ejs", {group});
})


// Get route to display page after quiz round
app.get("/rooms/:id/finishedQuiz", async (req, res) => {
    const myMinutes = req.query.myMinutes;
    const mySeconds = req.query.mySeconds;
    score = req.query.score;
    const group = await Group.findById(req.params.id);
    group.quizScore = parseInt(score);
    group.timeTaken.minutes = myMinutes;
    group.timeTaken.seconds = mySeconds;
    await group.save();
    
    const quizLength = questions.length;
    score = 0;
    res.render("finishedQuiz.ejs", {myMinutes, mySeconds, score: group.quizScore, quizLength, group})
})

// Get route to display page to start round one
app.get("/rooms/:id", isLoggedIn, async (req, res) => {
    const group = await Group.findById(req.params.id);
    res.render("rounds.ejs", { group });
})


/*
app.get("/rooms/:id/start", isLoggedIn, async (req, res) => {
    console.log('id is ', req.params.id);
    const group = await Group.findById(req.params.id);
    console.log('group: ', group);
    res.render("start.ejs", {group});

})
*/

// Get route to display quiz 
app.get("/rooms/:id/startQuiz", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);
    res.render("group1.ejs", { group });
})

// Get route to display round 2
app.get("/rooms/:id/story", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);
    res.render("story.ejs", { group });
})

// Post request to handle response from chatbot
app.post("/chat", async (req, res) => {
    try{
        console.log('in post request');
        const prompt = req.body.prompt;
        const response = await openai.createCompletion({
            model: "text-davinci-003",
  prompt: `${prompt}`,
  temperature: 0,
  max_tokens: 100,
  top_p: 1,
  frequency_penalty: 0,
  presence_penalty: 0,

        });

        res.status(200).send({
            bot: response.data.choices[0].text
        })
    } catch (e) {
        console.log(e);
        res.status(500).send({e});
    }
})

// Post request to handle image generation 
app.post("/", async (req, res) => {
    const {prompt, size} = req.body;

    const imageSize = size === 'small' ? '256x256' : size === 'medium' ? '512x512' : '1024x1024';

    try{
        const response = await openai.createImage({
            prompt,
            n: 1,
            size: imageSize
        });

        const imageUrl = response.data.data[0].url

        res.status(200).json({
            success: true,
            data: imageUrl
        });
    } catch (error) {
        res.status(400).json({
            success: true,
            error: 'image not generated'
        })
    }
})

/*
app.post("/urls", async (req, res) => {
    const {url1, url2, url3} = req.body;
    res.redirect("/urls");
})
*/

// Get request to render page to display image URL and essay 
app.get("/urls", async (req, res) => {
    const group = await Group.find({});
    res.render("/urls", {group});
})

// Get request to render whiteboard
app.get("/board",isLoggedIn, (req, res) => {
    let data = req.user.username;
    console.log(data)
    res.render('board', {username:data});
});


const questions = [
    {question: "What is the capital of France?", answers: [
        {text: "Paris", correct: true},
        {text: "London", correct: false},
        {text: "Berlin", correct: false}]},
    {question: "What is the largest planet in our solar system?", answers: [
        {text: "Mars", correct: false}, {text: "Jupiter", correct: true}, {text: "Saturn", correct: false}]},
    {question: "What is the highest mountain in the world?", answers: [
        {text: "Everest", correct: true}, {text: "B", correct: false}, {text: "C", correct: false}]}
];

let currentQuestionIndex = 0;
let score = 0;

let socketConnections = 0;

let musers = [];


io.on('connection', (socket) => {
    connections.push(socket);
    const user = {
        id: socket.id,
        username: socket.handshake.query.username,
        remainingTime: 0,
    };

    musers.push(user);

    // Listening to client event emiited to join room  
    socket.on('join', (data) => {
        socket.join(data.room);           
        io.to(data.room).emit('firstLoadQuestions', questions);
    })

    // Listening to client emitted event to load questions
    socket.on('submitQuestion', (sendData) => {
        socket.broadcast.emit('broadcastAnswer', sendData);
    })

// Socket event to handle if client can proceed to to round one depending on number of users joined in the room
    socket.on('roundOne', (data) => {        
        const myRoom = io.sockets.adapter.rooms.get(data.room);
        const numUsers = myRoom ? myRoom.size : 0;

        if (numUsers >= 2){            
            io.to(data.room).emit('roundOne', data)
        } else {
            let data = { numUsers };            
            socket.emit('notEnough', data);            
        }       
    })

// Socket event to handle display of images for other group members
    socket.on('savedImages', (data) => {
        socket.broadcast.to(data.room).emit('savedImages', data)
    })

      // Socket event to update timer for every group member
    socket.on('click', (data) => {
        socket.broadcast.to(data.room).emit('updateTimer', data);
    })

  
    socket.on('time', data => {
        socket.broadcast.emit('displayTime', data);
    })

   /* socket.on('resetScore', (score) => {
        score = 0;
    })
    */

    // Socket event to redirect users to page after completing quiz
    socket.on('redirectOthers', (data) => {
        console.log('trying to redirect');
        socket.broadcast.to(data.room).emit('redirectedOthers', data)
    })

    socket.on('answer', (data) => {
        socket.broadcast.to(data.room).emit('updateAnswer', data);

        const selectedAnswer = data.selectedAnswer;
        const isCorrect = data.isCorrect;

})

socket.on('updateScore', (isCorrect) => {
    if (isCorrect){
        score++;
}
})

// Socket event to update UI in quiz round
socket.on('buttonClicked', (data) => {
    socket.broadcast.to(data.room).emit('updateUi', data);
})

// Socket event to progress to next question
socket.on('handling-next-button', (data) => {    
    let value = 0;

    if(data.currentQuestionIndex < questions.length){
        value = 0;
        io.to(data.room).emit('loadQuestions', questions);
        return;
    } else {
        value = 1;
        socket.to(data.room).emit('score', {score, questions});
        io.to(data.room).emit('score', {score, questions});
    }
    })

    // Socket event to handle progress to second round
    socket.on('nextRound', (data) => {
        console.log(data);
        socket.broadcast.to(data.room).emit('nextRound', data);
    })


    // Socket event to copy prompt entered to generate image to all group members
    socket.on('formSubmit', (data) => {
        socket.broadcast.emit('fillDetails', data);
    })

    // Socket even to transfer same image URL to other clients
    socket.on('generateImage', (sendData) => {
        socket.broadcast.to(sendData.room).emit('transferImage', sendData);
    })

    // Socket event to display essay written in real-time to other members
    socket.on('startStory', (data) => {
        socket.broadcast.to(data.room).emit('copyStory', (data));
    })

    socket.on('showUrl', (data) => {
        socket.broadcast.to(data.room).emit('showingUrl', data)
    })

    // Socket event to handle essay submission
    socket.on('submitStory', (data) => {
        socket.broadcast.to(data.room).emit('submittingStory', data);
    })


    socket.on('disconnect', (data) => {
        socketConnections--;
        connections = connections.filter((con) => con.id !== socket.id);
        console.log(`${socket.id} has connected`);
    })

    // Merging board
    socket.emit("userList", musers.map((user) => ({ id: user.id, username: user.username, remainingTime: user.remainingTime })));

    socket.on("requestDrawingData", () => {
        socket.emit("initialize", drawingData);
    });

    socket.on('draw', (data) => {
        drawingData.push({ type: 'draw', x: data.x, y: data.y, color: data.color, lineWidth: data.lineWidth, pathId: socket.id });
        connections.forEach(con => {
            if (con.id !== socket.id) {
                con.emit('ondraw', { x: data.x, y: data.y, color: data.color, lineWidth: data.lineWidth, pathId: socket.id })
            }
        })
    });


    socket.on("segmentStart", () => {
        drawingData.push({ type: "segmentStart" });
        socket.broadcast.emit("segmentStart");
    });

    socket.on('down', (data) => {
        drawingData.push({ type: 'down', x: data.x, y: data.y, color: data.color, lineWidth: data.lineWidth });
        connections.forEach(con => {
            if (con.id !== socket.id) {
                con.emit('ondown', { x: data.x, y: data.y, color: data.color, lineWidth: data.lineWidth })
            }
        })
    });

    socket.on('user_joined', (userData) => {
        userConn.push(userData);
        socket.userData = userData;
        const userIndex = musers.findIndex((u) => u.id === socket.id);
        if (userIndex !== -1) {
            musers[userIndex].username = userData.username;
        }
        io.emit('userList', musers.map((user) => ({ id: user.id, username: user.username, remainingTime: user.remainingTime })));
        socket.emit("initialize", drawingData);
    });

    socket.on("start_timer", (time) => {
        const userIndex = musers.findIndex((u) => u.id === socket.id);
        if (userIndex !== -1) {
            musers[userIndex].remainingTime = time;
            io.emit("userList", musers.map((user) => ({ username: user.username, remainingTime: user.remainingTime })));
        }
    });

    socket.on("erase", (data) => {
        connections.forEach((con) => {
            if (con.id !== socket.id) {
                con.emit("onerase", { x: data.x, y: data.y, size: data.size });
            }
        });
    });

    socket.on("user_left", () => {
        musers = musers.filter((user) => user.id !== socket.id);
        io.emit("userList", musers.map((user) => ({ id: user.id, username: user.username, remainingTime: user.remainingTime })));
    });

})

const port = process.env.PORT || 3000;

http.listen(port, () => {
    console.log('server is running...');
})