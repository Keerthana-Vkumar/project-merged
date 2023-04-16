console.log('from script tag of group1')
console.log('room value ', window.room)
let room = window.room;
let myScore = window.score;
let groupId = window.id;

//var socket = io('http://localhost:3000');
var socket = io('https://cryptic-anchorage-13951.herokuapp.com');


let stopWatch;

const chatgpt = document.getElementById('chatgpt');
const chatContainer = document.getElementById("chat-container");

let loadInterval;

function loader(element){
    element.textContent = '';

    loadInterval = setInterval(() => {
        element.textContent += '.';

        if(element.textContent === "...."){
            element.textContent = "";
        }
    }, 300)
}

function typeText(element, text){
    let index = 0;

    let interval = setInterval(() => {
        if(index < text.length){
            element.innerHTML += text.charAt(index);
            index++;
        } else {
            clearInterval(interval);
        }
    }, 30)
}

function generateUniqueId(){
    const timestamp = Date.now();
    const randomNumber = Math.random();
    const hexadecimalString = randomNumber.toString(16);
    return `id-${timestamp}-${hexadecimalString}`;
}


function chatStripe(isAi, value, uniqueId){
    return (
        `
            <div class="wrapper ${isAi && 'ai'}">
            <div class="chat">
           
                <div class="profile">
                    <img
                        src="${isAi ? '/4711987.png' : '/user-profile-icon-free-vector.webp'}"
                    >
                <div class="message" id=${uniqueId}>${value}</div>
                </div>
                </div>
        `
    )
}


const handleSubmit = async (e) => {
    let parsedData = "";
    
    e.preventDefault();

    const data = new FormData(chatgpt);

    myPrompt = data.get('prompt');

    chatContainer.innerHTML += chatStripe(false, data.get('prompt'))

    chatgpt.reset();

    const uniqueId = generateUniqueId();

    chatContainer.innerHTML += chatStripe(true, "", uniqueId)

    chatContainer.scrollTop = chatContainer.scrollHeight;

    const messageDiv = document.getElementById(uniqueId);
    console.log('First message div ', messageDiv);
    loader(messageDiv);
    

    const response = await fetch('https://cryptic-anchorage-13951.herokuapp.com/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            prompt: data.get('prompt')
        })
    })

    clearInterval(loadInterval);
    messageDiv.innerHTML = "";

    if(response.ok){
        const data = await response.json();
        const parsedData = data.bot.trim();

        console.log('Parsed data is ', parsedData);

        typeText(messageDiv, parsedData);

        const sendData = {
            data: parsedData,
            elementId: uniqueId,
            myPrompt: myPrompt
        }
        socket.emit('submitQuestion', (sendData));
        
    } else {
        const err = await response.text();
        messageDiv.innerHTML = "Somethign went wrong;"
        alert(err);
    }    
}


socket.on('broadcastAnswer', (sendData) => {    

    const data = new FormData(chatgpt);

    chatContainer.innerHTML += chatStripe(false, sendData.myPrompt);

    chatgpt.reset();

    chatContainer.innerHTML += chatStripe(true, "", sendData.elementId)
    chatContainer.scrollTop = chatContainer.scrollHeight;


    let messageDiv = document.getElementById(sendData.elementId);
    loader(messageDiv);
    clearInterval(loadInterval);
    messageDiv.innerHTML = "";
    typeText(messageDiv, sendData.data);
})

chatgpt.addEventListener("submit", handleSubmit);
chatgpt.addEventListener("keyup", (e) => {
    if(e.keyCode === 13){
        handleSubmit(e);
    }
})


let startTime = new Date().getTime();

function buttonClick(){
    socket.emit('click', {timer: "timer", startTime: startTime, room});
    stopWatch = setInterval(countdown, 1000);
}

socket.on('updateTimer', (data) => {
    console.log('update timer');
    timer.style.display = "none";
    stopWatch = setInterval(countdown, 1000);
})

let distance;


function countdown(){
    let countDownDate = new Date(startTime + 2 * 60 * 1000);
    let now = new Date().getTime();
    
    distance = countDownDate - now;
    
    let minutes = Math.floor((distance % (1000 * 60 * 60 )) / (1000 * 60));
    let seconds = Math.floor((distance % (1000 * 60 )) / 1000);

    document.getElementById("minutes").innerHTML = minutes;
    document.getElementById("seconds").innerHTML = seconds;

    if(distance < 0){
        window.location.href = `/rooms/${groupId}/timer`;     
        document.getElementById("minutes").innerHTML = "00";
        document.getElementById("seconds").innerHTML = "00";     
    }
}


function pauseCountdown(){
    clearInterval(stopWatch);
    pauseTime = new Date().getTime();
    let durationInSeconds = Math.floor((pauseTime - startTime) / 1000);

    let durationMinutes = Math.floor(durationInSeconds / 60);
    let durationSeconds = durationInSeconds % 60;
    let timeObject = {realMinutes: durationMinutes, realSeconds: durationSeconds}

    return timeObject;
}


const questionElement = document.getElementById("question");
const answerButtons = document.getElementById("answer-buttons");
const nextButton = document.getElementById("next-btn");
let submitQuiz = document.getElementById("submit-quiz");

let currentQuestionIndex = 0;
let score = myScore;


socket.emit('join', {room});    


socket.on('firstLoadQuestions', (questions) => {
    stopWatch = setInterval(countdown, 1000);
    startQuiz(questions);
    socket.emit('resetScore', score);
})

function resetState(){
    nextButton.style.display = "none";
    while(answerButtons.firstChild){
        answerButtons.removeChild(answerButtons.firstChild);
    }
}

function startQuiz(questions){    
    nextButton.innerHTML = "Next";
    showQuestion(questions);      
}

function showQuestion(questions){
    resetState();

    let currentQuestion = questions[currentQuestionIndex];
    let questionNo = currentQuestionIndex + 1;
    questionElement.innerHTML = questionNo + "." + currentQuestion.question;

    for(let i = 0; i < currentQuestion.answers.length; i++) {
        const answer = currentQuestion.answers[i];
        const button = document.createElement("button");
        button.innerHTML = answer.text;
        button.classList.add("btn");
        if (i == 0){
            button.setAttribute("id", "one")
        } else if (i == 1) {
            button.setAttribute("id", "two");
        } else if (i == 2){
            button.setAttribute("id", "three")
        }  else {
            button.setAttribute("id", "four");
        }
        answerButtons.appendChild(button);

        if(answer.correct){
            button.dataset.correct = answer.correct;
    }
        button.addEventListener("click", selectAnswer);
}
    };
    

function selectAnswer(e){
      
    const selectedBtn = e.target;
    const isCorrect = selectedBtn.dataset.correct === "true";

    if (isCorrect){
        selectedBtn.classList.add("correct");
    } else {
        selectedBtn.classList.add("incorrect");
    }    
    
    Array.from(answerButtons.children).forEach(button => {
        if(button.dataset.correct === "true"){
            button.classList.add("correct");
        }
        button.disabled = true;
    })
    nextButton.style.display = "block";
    nextButton.addEventListener("click", handleNextButton);

    const answerData = {
        selectedAnswer: selectedBtn.innerHTML,
        isCorrect: isCorrect
    }

    socket.emit('updateScore', (isCorrect));

    socket.emit('answer', {selectedAnswer: selectedBtn.innerHTML,
        isCorrect: isCorrect, buttonId: selectedBtn.id, room, myClass: "btn"})   
}

socket.on('updateAnswer', ({selectedAnswer, buttonId, isCorrect, myClass}) => {
    
    let chosenButton = document.getElementById(buttonId);
    let allButtons = document.getElementsByClassName(myClass);    
   
    if (isCorrect){
        chosenButton.classList.add("correct");
    } else {
        chosenButton.classList.add("incorrect");
    }

    Array.from(allButtons).forEach(button => {
        if(button.dataset.correct === "true"){
            button.classList.add("correct");
        }
        button.disabled = true;
    })
    nextButton.style.display = "block";    

})


function handleNextButton(){
    currentQuestionIndex++;            
    theNextButtonId = "next-btn";
    socket.emit('buttonClicked', {theNextButtonId, room})
    nextButtonId = document.getElementById("next-btn");

    socket.emit('handling-next-button', {currentQuestionIndex, room, theNextButtonId});

    socket.on('loadQuestions', (questions) => {        
        showQuestion(questions);           
    });

            
    socket.on('score', (data) => {
        console.log('in score option');
        console.log('the score is ', data.score);
        showScore(data.score, data.questions);                 
    })
          
    }
        
            
function showScore(score, questions){
    resetState();
    questionElement.innerHTML = `You socred ${score} out of ${questions.length}`;
    
    submitQuiz.style.display = "block";
    submitQuiz.addEventListener('click', function(){
        redirectPage(score);
    });
    
    currentQuestionIndex = -1;     
}


function redirectPage(score){    
    let submitQuizId = "submit-quiz";
    let endTime = pauseCountdown();
    let myMinutes = endTime.realMinutes;
    let mySeconds = endTime.realSeconds;
   
    link = "/rooms/"+groupId+"/finishedQuiz?myMinutes="+myMinutes+"&mySeconds="+mySeconds+"&score="+score;
    socket.emit('redirectOthers', ({link, submitQuizId, room}));
    
    location.href = link;
    score = 0;    
}

socket.on('redirectedOthers', ({link, submitQuizId}) => {
    //console.log('redirected others');
    document.getElementById(submitQuizId).click();
    location.href = link;
})

socket.on('updateUi', (data) => {
    
    document.getElementById(data.theNextButtonId).style = "none";    
    currentQuestionIndex++; 
    
    socket.emit('handling-next-button', {currentQuestionIndex, room});
    
    socket.on('loadQuestions', (questions) => {       
        showQuestion(questions);       
        });

            
    socket.on('score', (data) => {
        console.log('in socre option');
        showScore(data.score, data.questions);
    })
})

socket.on('user-disconnected', name => {
    appendMessage(`${name} disconnected`);
})

document.querySelector("#myForm").addEventListener("submit", onSubmit);
document.querySelector("#save").style.display = "none";
let story = document.getElementById("story");
let submitStory = document.getElementById("submitStory");

submitStory.addEventListener("click", submitStory)


story.addEventListener("change", () => {
    let myStory = story.value;
    let data = {
        myStory,
        id: "story"
    }
    socket.emit('startStory', (data));
})

socket.on('copyStory', (data) => {
    let storyElement = document.getElementById(data.id);
    storyElement.value = data.myStory;
})
    

socket.on('fillDetails', (data) => {

    let myPrompt = document.getElementById(data.pId);
    let mySize = document.getElementById(data.sId);

    myPrompt.value = data.pValue;
    mySize.value = data.sValue;
   
})

socket.on('transferImage', (sendData) => {
    document.getElementById(sendData.id).src = sendData.imageUrl;     
})