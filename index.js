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
const httpServer = require("http").createServer();


dotenv.config();

const {isLoggedIn} = require("./middleware");

const Group = require('./models/group');
const Student = require('./models/student');
const Teacher = require("./models/teacher")

const userRoutes = require('./routes/auth/users');
//const dbUrl = process.env.DB_URL

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
  // console.log('Current user is ', currentUser);
    next();
})



//app.use('/', userRoutes);

app.get("/", (req, res) => {
    res.render('home');
}
);

app.get('/register', (req, res) => {
    res.render('register')
})

app.post('/register', async (req, res) => {
    try{
        console.log('in register route req.body is ', req.body);
        const {name, username, password, userType} = req.body;
        if (userType === "student"){
            const user = new Student({name, username});
            const registeredStudent = await Student.register(user, password);
            req.login(registeredStudent, err => {
                if (err) return next(err);
                console.log(registeredStudent);
            res.redirect("/");
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

app.get("/login", (req, res) => {
    res.render("login");
})

app.get("/logout", (req, res) => {
    req.logout()
    res.redirect("/")
})


app.post('/login', (req, res) => {
    console.log('login route')
    if (req.body.userType === 'student') {
        console.log('student')
        passport.authenticate('studentLocal')(req, res, function () {
            const redirectUrl = req.session.returnTo || '/'
            res.redirect("/");
          });


    } else if (req.body.userType === 'professor') {
        console.log('teacher')
        passport.authenticate('teacherLocal')(req, res, function () {
            const redirectUrl = req.session.returnTo || '/'
            res.redirect("/teacher");
          });
    }
})


app.get("/group", isLoggedIn, async (req, res) => {
    let students = await Student.find({});
    const groups = (students.length / 2) + 1 ;
    res.render('addgroup', {groups});
})

app.post("/group", isLoggedIn, async (req, res) => {
    console.log('in add grooup');
    console.log(req.body);

    const group = new Group(req.body);
    console.log('the group ', group);
    await group.save()
    res.redirect("/groups");
})

app.get("/groups", isLoggedIn, async (req, res) => {
    const groups = await Group.find({});
    res.render("groups", {groups})
})

app.get("/groups/:id", isLoggedIn, async (req, res) => {
    const group = await Group.findById(req.params.id).populate('student1').populate('student2');
    console.log('the group is ', group);
    res.render("showGroup", { group })
})

app.get('/groups/:id/students/new', isLoggedIn, async (req, res) => {
    const students = await Student.find({});
    const { id } = req.params;
    res.render('addstudent', {id, students});
})

app.post("/groups/:id/students", isLoggedIn, async (req, res) => {
    const { id } = req.params;
    const group = await Group.findById(id);
    const { student1, student2 } = req.body;
    console.log('students ', req.body);
    const stud1 = await Student.findOne({ username: student1})
    const stud2 = await Student.findOne({ username: student2})
    group.student1 = stud1
    group.student2 = stud2
    await group.save()
    res.redirect('/groups');
    res.send(group);
   

})

app.post("/rooms/:id/urls", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    const group = await Group.findById(id);
   // res.send('post route');


    try{
        console.log('in post request');
        const imageUrl = req.body.imageUrl;
        console.log('the image url is ',imageUrl)

        group.imageUrls.push(imageUrl);
        await group.save();
        console.log('updated group is ', group);
        res.redirect(`/rooms/${id}/story`);

    } catch (e) {
        console.log(e);
        res.status(500).send({e});
    }

})


app.get("/rooms/:id/urls", isLoggedIn, async (req, res) => {
    console.log('get urls request')
    const {id} = req.params;
  //  console.log('id is this ', id);
    const group = await Group.findById(id);

    //console.log('the group here is ', group);
    res.render('urls', {group});
})

app.post("/rooms/:id/urls/story", isLoggedIn, async (req, res) => {
    console.log('submit story route');
    const {id} = req.params;
    const group = await Group.findById(id);

    try{
        const story = req.body.story;
        group.story = story;
        await group.save();
        console.log('trying to save the story')
       // console.log('updated group is ', group);
        res.redirect('/finishedStory');
    } catch (e) {
        console.log(e);
        res.status(500).send({e});

    }
})

app.get("/finishedStory", isLoggedIn, (req, res) => {
    res.render("finishedStory");
})


app.get("/rooms", isLoggedIn, async (req, res) => {
    // console.log('in rooms ', req.user);
     if(req.user.userType === "student"){
        
            const group = await Group.findOne({ $or: [{ student1: req.user._id}, { student2: req.user._id}]});
            //console.log('users group is ', group)
            res.render('rooms.ejs', {group});       
         
     }
     
 })

app.get("/student", isLoggedIn, (req, res) => {
    res.render("student.ejs")
})

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
    console.log('all students ', allGroups);
    for(let group of allGroups){
        console.log('group is ', group)
        allStudents.push(group.student1)
        allStudents.push(group.student2)
    }
    console.log(allStudents);

   // let allStudentIds = allStudents.map(student => student._id);
  

    /*
    for(let ele of totalStudents){
        for (let stud of allStudents){
            if (ele != stud){
                leftStudents.push(ele);
            }
        }
    }
    */
   console.log('Length of groups ', allStudents.length);
   console.log('Length of total students ', totalStudents.length);

   const remainingStudents = totalStudents.length - allStudents.length;

    //let leftStudents = totalStudents.filter(student => !allStudentIds.includes(student.toString()));
    
    //console.log('Remaining students ', leftStudents);
    res.render("teacher.ejs", {totalStudents, allStudents});
})

app.get("/rooms/:id/timer", async (req, res) => {
    const group = await Group.findById(req.params.id);
    console.log("timer over");
    res.render("timer.ejs", {group});

})

app.post('/resetScore', (req, res) => {
    console.log('this is reset score route');
})

app.get("/rooms/:id/finishedQuiz", async (req, res) => {
    const myMinutes = req.query.myMinutes;
    const mySeconds = req.query.mySeconds;
    score = req.query.score;
    const group = await Group.findById(req.params.id);
    group.quizScore = parseInt(score);
    group.timeTaken.minutes = myMinutes;
    group.timeTaken.seconds = mySeconds;
    await group.save();
    console.log('From finished quiz route: end time ', myMinutes, mySeconds);
    console.log('from finished quiz: score ', group.quizScore);
    const quizLength = questions.length;
    score = 0;
    //console.log('the score is ', score);
    //console.log('the score from database is ', group.quizScore);
    //console.log('th eupdated group is ', group)
    res.render("finishedQuiz.ejs", {myMinutes, mySeconds, score: group.quizScore, quizLength, group})
})

app.get("/rooms/:id", isLoggedIn, async (req, res) => {

    const group = await Group.findById(req.params.id);
    //console.log('group in rounds is ', group);

    res.render("rounds.ejs", { group });
})

app.get("/rooms/:id/start", isLoggedIn, async (req, res) => {
    console.log('id is ', req.params.id);
    const group = await Group.findById(req.params.id);
    console.log('group: ', group);

        res.render("start.ejs", {group});

})

app.get("/rooms/:id/startQuiz", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    console.log('id is this ', id);
    const group = await Group.findById(id);
    //console.log('group passed to group1.ejs ', group)


   res.render("group1.ejs", { group });
})


app.get("/rooms/:id/story", isLoggedIn, async (req, res) => {
    const {id} = req.params;
    console.log('id is this ', id);
    const group = await Group.findById(id);
    res.render("story.ejs", { group });
})


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



app.post("/urls", async (req, res) => {
    const {url1, url2, url3} = req.body;

    console.log('urls are ', url1, url2, url3)
    res.redirect("/urls");
})

app.get("/urls", async (req, res) => {
    const group = await Group.find({});
    res.render("/urls", {group});
})



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
    //console.log('a client connected');
    connections.push(socket);
    const user = {
        id: socket.id,
        username: socket.handshake.query.username,
        remainingTime: 0,
    };

    musers.push(user);

    socket.on('join', (data) => {





            socket.join(data.room);

           // socket.to(data.room).broadcast.emit('userJoined', req.user)
            //console.log('a person joined room')





        io.to(data.room).emit('firstLoadQuestions', questions);
    })

    socket.on('submitQuestion', (sendData) => {
        console.log('Data ', sendData.data);
        console.log('Id ', sendData.elementId);
        console.log('Prompt ', sendData.myPrompt);
        socket.broadcast.emit('broadcastAnswer', sendData);
    })

    socket.on('roundOne', (data) => {
        console.log('Dtata is here ', data);
        console.log('roundone event ', io.sockets.adapter.rooms[data.room])
        const myRoom = io.sockets.adapter.rooms.get(data.room);
        const numUsers = myRoom ? myRoom.size : 0;
        console.log('users ', numUsers)

        if (numUsers >= 2){
            console.log('real event ')
            io.to(data.room).emit('roundOne', data)
        } else {
            let data = { numUsers };
            console.log('not enough people joined to room ');
            socket.emit('notEnough', data);
            console.log('not enough emitted')
        }
       
    })

    socket.on('savedImages', (data) => {
        console.log('saved Images ')
        socket.broadcast.to(data.room).emit('savedImages', data)
    })

    socket.on('roundTwo', (data) => {
        console.log('roundtwo event')
        const myRoom = io.sockets.adapter.rooms.get(data.room);
        const numUsers = myRoom ? myRoom.size : 0;
        console.log('users ', numUsers)

        if (numUsers >= 2){
            console.log('real event ')
            io.to(data.room).emit('roundTwo', data)
        } else{
            let data = {
                numUsers
            }
            console.log('not enough people joined to room ');
            socket.emit('notEnough', data);
        }
        
    })


    socket.on('click', (data) => {
        socket.broadcast.to(data.room).emit('updateTimer', data);
    })

    socket.on('time', data => {
        socket.broadcast.emit('displayTime', data);
    })

    /*

      socket.on('new-user', ({name, room}) => {
          users[socket.id] = name;
          socket.broadcast.to(room).emit('user-connected', name);
      })
  */



    socket.on('resetScore', (score) => {
        score = 0;
    })

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
        console.log("Sore is now "+score);
}
})



socket.on('buttonClicked', (data) => {
    socket.broadcast.to(data.room).emit('updateUi', data);
})


socket.on('handling-next-button', (data) => {

    console.log('index', currentQuestionIndex);
    console.log('Questions length'+questions.length);
    let value = 0;
    if(data.currentQuestionIndex < questions.length){
        console.log('Case 1 where more questions')
        value = 0;
        io.to(data.room).emit('loadQuestions', questions);
        console.log('display next question');
        return;
        }
        else{
           value = 1;

            socket.to(data.room).emit('score', {score, questions});

           io.to(data.room).emit('score', {score, questions});
           console.log('after emitting score from index');


        }


    })

    socket.on('nextRound', (data) => {
        console.log(data);
        socket.broadcast.to(data.room).emit('nextRound', data);
    })

    socket.on('formSubmit', (data) => {
        console.log(data.pId);
        console.log(data.sId);
        console.log(data.pValue);
        console.log(data.sValue);
        socket.broadcast.emit('fillDetails', data);

    })

    socket.on('generateImage', (sendData) => {
        console.log('Url ', sendData.imageUrl);
        console.log('Id ', sendData.id);
        socket.broadcast.to(sendData.room).emit('transferImage', sendData);
    })

    socket.on('startStory', (data) => {
        console.log('start story data is ', data);
        socket.broadcast.to(data.room).emit('copyStory', (data));
    })

    socket.on('showUrl', (data) => {
        console.log('show url index ')
        socket.broadcast.to(data.room).emit('showingUrl', data)
    })

    socket.on('submitStory', (data) => {
        console.log('submit story');
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


app.get("/board",isLoggedIn, (req, res) => {
        let data = req.user.username;
        console.log(data)
        res.render('board', {username:data});
    }
);

const port = process.env.PORT || 3000;

http.listen(port, () => {
    console.log('server is running...');
})