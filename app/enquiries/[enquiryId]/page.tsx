"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Camera, CheckCircle2, LockKeyhole, Mail, ArrowLeft } from "lucide-react";
import { ClientEnquiryThread } from "@/components/client-enquiry-thread";

export default function CustomerEnquiryConversationPage() {
  const params=useParams<{enquiryId:string}>();
  const enquiryId=String(params.enquiryId||"");
  const [state,setState]=useState<"checking"|"ready"|"request"|"sent">("checking");
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  useEffect(()=>{
    if(!enquiryId)return;
    let live=true;
    async function verify() {
      const hash=window.location.hash;
      const token=new URLSearchParams(hash.replace(/^#/,"")).get("access");
      if(token) {
        window.history.replaceState(null,"",window.location.pathname+window.location.search);
        try {
          const response=await fetch("/api/public/enquiries/access",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token})});
          const data=await response.json();
          if(!response.ok)throw new Error(data.error||"This private link is no longer valid.");
          if(live)setState("ready");
          return;
        } catch(e) {
          if(live){setError(e instanceof Error?e.message:"Private access could not be verified.");setState("request");}
          return;
        }
      }
      try {
        const response=await fetch("/api/public/enquiries/"+encodeURIComponent(enquiryId)+"/messages",{cache:"no-store"});
        if(live)setState(response.ok?"ready":"request");
      } catch { if(live)setState("request"); }
    }
    void verify();
    return()=>{live=false};
  },[enquiryId]);

  async function requestLink(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try {
      const response=await fetch("/api/public/enquiries/"+encodeURIComponent(enquiryId)+"/access-link",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"A private link could not be requested.");
      setMessage(data.message||"If the enquiry details match, a fresh link will be sent.");
      setState("sent");
    } catch(e) { setError(e instanceof Error?e.message:"A private link could not be requested."); }
    finally { setBusy(false); }
  }

  return <main style={{minHeight:"100vh",background:"#f4f1e9",color:"#292821",padding:"clamp(18px,5vw,54px) 16px"}}>
    <div style={{maxWidth:760,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,marginBottom:34}}>
        <Link href="/" style={{display:"inline-flex",alignItems:"center",gap:10,textDecoration:"none",color:"#292821",fontSize:13,fontWeight:800,letterSpacing:".12em"}}><span style={{width:38,height:38,display:"grid",placeItems:"center",background:"#292821",color:"#d8bd88",borderRadius:7}}><Camera size={19}/></span>LENS &amp; LIGHT</Link>
        <Link href="/photographers" style={{fontSize:12,color:"#716958",textDecoration:"none"}}>Explore photographers</Link>
      </header>
      <section style={{background:"#fffdf9",border:"1px solid #e0dbd1",borderTop:"3px solid #b79b68",borderRadius:8,padding:"clamp(20px,5vw,36px)",boxShadow:"0 12px 34px rgba(41,40,33,.06)"}}>
        {state==="checking"?<p style={{fontSize:13,color:"#716958"}}>Verifying your private conversation link…</p>:state==="ready"?<>
          <p style={{fontSize:10,fontWeight:800,letterSpacing:".18em",color:"#8a7450"}}>PRIVATE CLIENT COMMUNICATION</p>
          <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(30px,6vw,42px)",margin:"10px 0"}}>Your conversation.</h1>
          <p style={{fontSize:13,lineHeight:1.7,color:"#716958",marginBottom:18}}>Continue your conversation with your photographer in this private space. Only you, the assigned photographer and authorised Lens &amp; Light support administrators can access it.</p>
          <ClientEnquiryThread enquiryId={enquiryId} audience="customer" defaultOpen/>
        </>:state==="sent"?<>
          <div style={{width:44,height:44,borderRadius:"50%",display:"grid",placeItems:"center",background:"#edf1e9",color:"#58704e"}}><CheckCircle2 size={22}/></div>
          <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:30,margin:"14px 0 8px"}}>Check your email.</h1>
          <p style={{fontSize:13,lineHeight:1.7,color:"#716958"}}>{message}</p>
          <p style={{fontSize:12,color:"#716958",marginTop:16}}>For your privacy, this page does not reveal whether an enquiry or email address exists.</p>
        </>:<>
          <p style={{fontSize:10,fontWeight:800,letterSpacing:".18em",color:"#8a7450"}}>SECURE ACCESS</p>
          <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(30px,6vw,42px)",margin:"10px 0"}}>Open your conversation.</h1>
          <p style={{fontSize:13,lineHeight:1.7,color:"#716958"}}>Enter the email address you used when sending the enquiry. We'll send a fresh one-time access link if the details match.</p>
          <form onSubmit={requestLink} style={{display:"grid",gap:12,marginTop:20}}>
            <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{padding:12,border:"1px solid #d5cec1",borderRadius:4,font:"inherit",fontWeight:400}}/></label>
            {error&&<p role="alert" style={{fontSize:12,color:"#9a3d32"}}>{error}</p>}
            <button type="submit" disabled={busy} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:12,border:0,borderRadius:4,background:"#292821",color:"#fff",fontSize:13,cursor:"pointer"}}><Mail size={15}/>{busy?"Requesting link…":"Email me a private link"}</button>
          </form>
        </>}
        <div style={{borderTop:"1px solid #e8e2d8",marginTop:24,paddingTop:16,display:"flex",gap:8,alignItems:"center",fontSize:11,color:"#82796c"}}><LockKeyhole size={14}/>Private, time-limited access · <Link href="/contact" style={{color:"#78654d"}}>Need help?</Link></div>
      </section>
      <p style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#81796d",marginTop:18}}><ArrowLeft size={13}/> Your conversation is separate from public photographer profiles.</p>
    </div>
  </main>;
}
