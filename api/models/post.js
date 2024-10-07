const mongoose=require('mongoose')
const {Schema,model}=mongoose;


const postSchema=mongoose.Schema({
    title:String,
    summary:String,
    content:String,
    file:String,
    author:{
        type:Schema.Types.ObjectId, ref:'user'
    }
},{
    timestamps:true,
})

module.exports=model('post',postSchema)