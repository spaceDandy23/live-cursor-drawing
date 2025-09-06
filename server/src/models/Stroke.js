import mongoose from "mongoose";


const strokeSchema = mongoose.Schema({

    x:{
        type: number,
        required: true
    },
    y:{
        type: number,
        required: true
    }
});



const Note = mongoose.model("Stroke",strokeSchema)