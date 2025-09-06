import mongoose from "mongoose";

const strokeSchema = new mongoose.Schema({

    color: {
        type: String,
        required: true
    },

    move_to: {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
    },
    points: [
        {
        x: { type: Number, required: true },
        y: { type: Number, required: true }
        }
    ],
    erase: {
        type: Boolean,
        required: true
    }
    


});

const Stroke = mongoose.model("Stroke", strokeSchema);

export default Stroke;