// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
//import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD0h-5hmUsE-AYthbskpfLpu2hVRPIww3I",
  authDomain: "unir-puntos.firebaseapp.com",
  databaseURL: "https://unir-puntos-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "unir-puntos",
  storageBucket: "unir-puntos.firebasestorage.app",
  messagingSenderId: "616259262440",
  appId: "1:616259262440:web:62bfaca69a12fdf0cc365d",
  measurementId: "G-X7FCH8232X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);
export const db = getDatabase(app);
