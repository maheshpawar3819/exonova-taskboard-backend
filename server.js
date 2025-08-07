require("dotenv").config();
const express=require("express");
const app=express();
const cors=require("cors");
const {createServer}=require("http")
const {Server}=require("socket.io")
const connectDb=require("./config/db");
const authRoutes=require("./routes/authRoutes")
const boardRoutes=require("./routes/boardRoutes");
const cardRoutes=require("./routes/cardRoutes")
const commentRoutes=require("./routes/commentRoutes")


//database connection
connectDb();

const httpServer=createServer(app);
const io=new Server(httpServer,{cors : {origin : "*"}});

//middlewares
app.use(cors());
app.use(express.json());

//routes
app.use("/api/auth",authRoutes)
app.use("/api/boards",boardRoutes)
app.use("/api/cards",cardRoutes)
app.use("/api/comments",commentRoutes)

//socket io
io.on("connection",(socket) => {
    console.log("User Connected")

    socket.on("userOnline",(userId)=> {
        socket.userId=userId;
        onlineUsers=add(userId);
        io.emit("UpdateOnlineUsers",Array.from(onlineUsers))

    })

    socket.on("moveCard",(data)=> {
        socket.broadcast.emit("cardMoved",data);
    })

    socket.on("addCard",(data)=> {
        socket.broadcast.emit("cardAdded",data)
    })

    socket.on("disconnect",() => {
        if(socket.userId) onlineUsers.delete(socket.userId);
        io.emit("updateOnlineUsers",Array.from(onlineUsers))
        console.log("User Disconnected")
    })
})

const PORT=process.env.PORT || 5000;
httpServer.listen(PORT,() => {
    `Server is listning on Port : ${PORT}`
})
