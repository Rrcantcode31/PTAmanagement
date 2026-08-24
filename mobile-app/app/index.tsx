import { useState } from "react";
import { Text, View, TextInput, Button, StyleSheet, Alert } from "react-native";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { TouchableOpacity, ImageBackground} from "react-native";
import axios from "axios";
import {API_URL} from "./_layout";

import { useAuth } from "../appContext/authContext";


export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { login } = useAuth();

  const [fontsLoaded] = useFonts({
    "monsterrat_kp": require("../assets/Font/monsterrat_kp.ttf"),
    "monsterrat_font": require("../assets/Font/monsterrat_font.ttf"),
    "monster_act": require("../assets/Font/monster_act.ttf"),
    "digitalFont": require("../assets/Font/digitalFont.ttf")
  });

  if (!fontsLoaded) {
    return null; // or <AppLoading />
  }

const handleLogin = async () => {
  try {
    const res = await axios.post(`${API_URL}/api/auth/login`, {
      email,
      password,
    });

    if (res.data.success) {
        const user = res.data.user;
        await login(user, res.data.token);   // only once

        Alert.alert("Success", res.data.message);

        if (user.type === "driver") {
          router.replace("/driverApp/driverDashboard");
        } else {
          router.replace("/Dashboard");
        }
      }
        else {
              Alert.alert("Error", res.data.message);
            }

          } catch (error: any) {
            console.log(error.response?.data || error.message);
            Alert.alert("Error", "Login failed");
          }
        };

  return (
    <ImageBackground
      source={require('../assets/images/main-bg.png')}
      style={{ flex: 1 }}
      resizeMode="cover"
    >

    {/* Login form */}
    <View style={styles.container}>
      <Text style={styles.title}>Login</Text>

      <TextInput
        placeholder="Email"
        style={styles.input}
        onChangeText={setEmail}
      />

      <TextInput
        placeholder="Password"
        secureTextEntry
        style={styles.input}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>

      <Text style={styles.link} onPress={() => router.push("/Signup")}>
        Don't have an account? Sign-up
      </Text>
    </View>
  </ImageBackground>
);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-start",
    padding: 25,
    paddingTop: 160,
   
  },

  title: {
    marginTop:10,
    fontSize: 43,
    fontFamily: "monsterrat_kp",
    marginBottom: 35,
    textAlign: "center",
    
  },

  input: {
    borderWidth: 0.5,
    marginBottom: 20,
    padding: 10,
    borderRadius: 15,
    borderColor: "#1513133e" ,
    fontFamily: "monster_act",
    backgroundColor: "#ffffff4c",
  },

  button: {
    backgroundColor: "#4384ac", 
    paddingVertical: 10,        
    borderRadius: 13,           
    marginBottom: 10,           
    alignItems: "center",       
  },

  buttonText: {
    color: "white",             
    fontSize: 14,               
    fontFamily: "monster_act",  
  },

  link: {
    marginTop: 15,
    color: "blue",
    fontSize: 15,
    textAlign: "center",
    fontFamily: "monsterrat_font",
    fontWeight: 600
  },
});