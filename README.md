# Team3-project: Improved Collaborative Learning: AI-Powered Group Activities and Interactive Whiteboard.
This is a web application that allows students having group activity with AI-powered tools and helping teachers and student have a more collaborative learning experience through a interactive whiteboard. Our application has been hosted on Heroku here: https://cryptic-anchorage-13951.herokuapp.com/
## Compiling and running locally.
To compile and run the application locally, set the URL of the socket.io host to localhost with port 3000.<br />
Open the terminal window under the working directory and type:<br />
```npm install```<br />
This step will help you obtain all the  dependencies.<br />
Next, use the following command, as this is the entry point of our application: <br />
```nodemon index.js```<br />
## Test tools ##
### Jmeter : <br />
1. Open jmx file provided above inside the ```/backups``` directory in Jmeter's root location to run the tests.<br />
2. To generate the report, use the no GUI verision for testing. type the following script in the command line window under the ```/bin``` directory of Jmeter:<br />
```jmeter -n -t C:\apache-jmeter-5.5\backups\<test file name in backup folder>.jms -l C:\apache-jmeter-5.5\backups\test.csv```<br />
### Artillery : <br />
1.Open a new prooject and put the file inside the project. Type this code in the terminal window under the working directory.<br />
```npm install artillery artillery-engine-socketio-v3```<br />
Next run this line<br />
```$ artillery run test.yml --output report.json```<br />
