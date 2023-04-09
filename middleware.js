module.exports.isLoggedIn = (req, res, next) => {
    console.log("REQ.USER ", req.user);
    if(!req.isAuthenticated()){
        req.session.returnTo = req.originalUrl;
        console.log(req.session.returnTo);
        return res.redirect("/login");
    }
    next();
}