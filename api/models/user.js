const mongoose=require('mongoose');
const {Schema,model}=mongoose;

const userSchema=mongoose.Schema({
    username:{type:String,required:true,min:4,unique:true},
    password:{type:String,required:true}
})

module.exports=model('user',userSchema);