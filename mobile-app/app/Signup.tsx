import { View, Text, TextInput, Alert, StyleSheet, ScrollView, ImageBackground} from "react-native";
import { useState } from "react";
import axios from "axios";
import { useFonts } from "expo-font";
import { router } from "expo-router";
import { TouchableOpacity } from "react-native";
import { Picker } from "@react-native-picker/picker";
import {API_URL} from "./_layout";


export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  // Fare category is a self-declared discount label only — it does NOT
  // grant a discount by itself. Drivers still verify eligibility with a
  // valid physical ID before honoring it. See disclaimer text below.
  const [fareCategory, setFareCategory] = useState("regular");

  const [fontsLoaded] = useFonts({
    monsterrat_kp: require("../assets/Font/monsterrat_kp.ttf"),
    monsterrat_font: require("../assets/Font/monsterrat_font.ttf"),
    monster_act: require("../assets/Font/monster_act.ttf"),
  });

  const handleRegister = async () => {

    try {
      // Note: role_id is intentionally NOT sent from the client.
      // This screen only ever creates commuter accounts — the backend
      // should assign the commuter role itself, not trust a client-
      // supplied role_id. (Admin/driver accounts are created by admins
      // through a separate, protected flow.)
      const res = await axios.post(`${API_URL}/api/auth/signup`, {
        email,
        password,
        firstName,
        middleName,
        lastName,
        contactNumber,
        fareCategory,
      });

      if (res.data.success) {
        Alert.alert("Success", res.data.message);
        router.replace("/");
      } else {
        Alert.alert("Error", res.data.message);
      }
    } catch (error: any) {
      console.log("Signup error:", error.response?.data || error.message);
      Alert.alert("Error", error.response?.data?.message || "Signup failed");
    }
  };

  return (
    <ImageBackground
          source={require('../assets/images/main-bg.png')}
          style={{ flex: 1 }}
          resizeMode="cover"
        >
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Sign-up</Text>

      <TextInput placeholder="Email" style={styles.input} onChangeText={setEmail} />
      <TextInput placeholder="Password" secureTextEntry style={styles.input} onChangeText={setPassword} />

      <TextInput placeholder="First Name" style={styles.input} onChangeText={setFirstName} />
      <TextInput placeholder="Middle Name" style={styles.input} onChangeText={setMiddleName} />
      <TextInput placeholder="Last Name" style={styles.input} onChangeText={setLastName} />

      <TextInput placeholder="Contact Number" style={styles.input} onChangeText={setContactNumber} />

      <Text style={styles.fieldLabel}>Fare Category</Text>

      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={fareCategory}
          onValueChange={(itemValue) => setFareCategory(itemValue)}
        >
          <Picker.Item label="Regular" value="regular" />
          <Picker.Item label="Student" value="student" />
          <Picker.Item label="PWD" value="pwd" />
          <Picker.Item label="Senior Citizen" value="senior" />
        </Picker>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Sign-up</Text>
      </TouchableOpacity>

      <Text style={styles.link} onPress={() => router.push("/")}>
        Already have an account? Login
      </Text>
    </ScrollView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
    container: {
    flex: 1,
    justifyContent: "flex-start",
    padding: 25,
    paddingTop: 110,
   
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

  fieldLabel: {
    fontFamily: "monster_act",
    fontSize: 13,
    marginBottom: 6,
    color: "#333",
  },

  pickerContainer: {
    borderWidth: 0.5,
    borderRadius: 15,
    marginBottom: 10,
    justifyContent: "center",
    height: 38,
    width: 220,
    fontFamily: "monsterrat_font",
    overflow: "hidden",
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