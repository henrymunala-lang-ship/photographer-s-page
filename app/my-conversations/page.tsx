"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Camera, CheckCircle2, LockKeyhole, Mail, MessageCircle, RefreshCw } from "lucide-react";
import { ClientEnquiryThread } from "@/components/client-enquiry-thread";

type Conversation = {
  enquiry_id: string;
  photographer_name: string;
  photographer_slug: string;
  event_type: string;
  event_date: string | null;
  event_location: string;
  status: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_at: string | null;
};

export default function ClientPortalPage() {
  const [state, setState] = useState<"checking"|"request"|"sent"|"ready">("checking");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadConversations() {
    setRefreshing(true);
    try {
      const response = await fetch("/api/public/client-portal/conversations", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Your conversations could not be loaded.");
      setConversations(Array.isArray(data.conversations) ? data.conversations : []);
      setState("ready");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your conversations could not be loaded.");
      setState("request");
    } finally { setRefreshing(false); }
  }

  useEffect(() => {
    let active = true;
    async function verify() {
      const token = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("access");
      if (token) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
        try {
          const response = await fetch("/api/public/client-portal/access", {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token })
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || "This portal link is no longer valid.");
          if (active) await loadConversations();
          return;
        } catch (e) {
          if (active) { setError(e instanceof Error ? e.message : "Portal access could not be verified."); setState("request"); }
          return;
        }
      }
      try {
        const response = await fetch("/api/public/client-portal/conversations", { cache: "no-store" });
        if (!response.ok) throw new Error("No active portal session.");
        const data = await response.json();
        if (active) { setConversations(Array.isArray(data.conversations) ? data.conversations : []); setState("ready"); }
      } catch { if (active) setState("request"); }
    }
    void verify();
    return () => { active = false; };
  }, []);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/public/client-portal/access-link", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "A portal link could not be requested.");
      setNotice(data.message || "If your details match, a secure link will be emailed to you.");
      setState("sent");
    } catch (e) { setError(e instanceof Error ? e.message : "A portal link could not be requested."); }
    finally { setBusy(false); }
  }

  return <main style={{minHeight:"100vh",background:"#f4f1e9",color:"#292821",padding:"clamp(18px,5vw,54px) 16px"}}>
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,marginBottom:30}}>
        <Link href="/" style={{display:"inline-flex",alignItems:"center",gap:10,textDecoration:"none",color:"#292821",fontSize:13,fontWeight:800,letterSpacing:".12em"}}><span style={{width:38,height:38,display:"grid",placeItems:"center",background:"#292821",color:"#d8bd88",borderRadius:7}}><Camera size={19}/></span>LENS &amp; LIGHT</Link>
        <Link href="/photographers" style={{fontSize:12,color:"#716958",textDecoration:"none"}}>Explore photographers</Link>
      </header>
      <section style={{background:"#fffdf9",border:"1px solid #e0dbd1",borderTop:"3px solid #b79b68",borderRadius:8,padding:"clamp(20px,5vw,36px)",boxShadow:"0 12px 34px rgba(41,40,33,.06)"}}>
        <p style={{fontSize:10,fontWeight:800,letterSpacing:".18em",color:"#8a7450"}}>YOUR LENS &amp; LIGHT SPACE</p>
        {state==="checking" ? <p style={{fontSize:13,color:"#716958"}}>Verifying your private portal…</p> :
        state==="sent" ? <>
          <div style={{width:44,height:44,borderRadius:"50%",display:"grid",placeItems:"center",background:"#edf1e9",color:"#58704e",marginTop:12}}><CheckCircle2 size={22}/></div>
          <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:34,margin:"14px 0 8px"}}>Check your email.</h1>
          <p style={{fontSize:13,lineHeight:1.7,color:"#716958"}}>{notice}</p>
          <p style={{fontSize:12,color:"#81796d",marginTop:16}}>For privacy, we don't reveal whether an email address has enquiries in Lens &amp; Light.</p>
          <button onClick={()=>setState("request")} style={{marginTop:16,border:0,background:"transparent",color:"#78654d",textDecoration:"underline",cursor:"pointer"}}>Request another link</button>
        </> :
        state==="ready" ? <>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"end",gap:12,flexWrap:"wrap"}}>
            <div><h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(30px,6vw,42px)",margin:"10px 0 6px"}}>My conversations.</h1><p style={{fontSize:13,lineHeight:1.7,color:"#716958",margin:0}}>All your photographer enquiries and private chats, gathered in one place.</p></div>
            <button onClick={()=>void loadConversations()} disabled={refreshing} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"9px 12px",border:"1px solid #d9d2c5",borderRadius:4,background:"#fff",color:"#514b40",cursor:"pointer"}}><RefreshCw size={14}/>{refreshing?"Refreshing":"Refresh"}</button>
          </div>
          {conversations.length===0 ? <div style={{padding:24,marginTop:22,border:"1px dashed #d9d2c5",borderRadius:7,textAlign:"center"}}><MessageCircle size={24} color="#8a7450"/><h2 style={{fontFamily:"Georgia,serif",fontWeight:400}}>No conversations yet</h2><p style={{fontSize:13,color:"#716958"}}>When you enquire with a photographer, your conversation will appear here.</p><Link href="/photographers" style={{color:"#78654d"}}>Find a photographer</Link></div> :
            <div style={{display:"grid",gap:14,marginTop:22}}>
              {conversations.map(item=><article key={item.enquiry_id} style={{border:"1px solid #e0dbd1",borderRadius:7,padding:16,background:"#faf8f3"}}>
                <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
                  <div><p style={{fontSize:10,fontWeight:800,letterSpacing:".12em",color:"#8a7450",margin:"0 0 6px"}}>PHOTOGRAPHER</p><h2 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:24,margin:"0 0 5px"}}>{item.photographer_name}</h2><p style={{fontSize:12,color:"#716958",margin:0}}>{item.event_type}{item.event_location ? " · "+item.event_location : ""}{item.event_date ? " · "+new Date(item.event_date).toLocaleDateString("en-KE") : ""}</p></div>
                  <div style={{fontSize:11,color:"#716958",textAlign:"right"}}><span style={{display:"inline-flex",alignItems:"center",gap:5}}><MessageCircle size={13}/>{item.message_count} {item.message_count===1?"message":"messages"}</span><p style={{margin:"6px 0 0",textTransform:"capitalize"}}>{item.status.replace(/_/g," ")}</p></div>
                </div>
                <ClientEnquiryThread enquiryId={item.enquiry_id} audience="customer"/>
              </article>)}
            </div>
          }
        </> : <>
          <h1 style={{fontFamily:"Georgia,serif",fontWeight:400,fontSize:"clamp(30px,6vw,42px)",margin:"10px 0"}}>All your chats. One place.</h1>
          <p style={{fontSize:13,lineHeight:1.7,color:"#716958"}}>Enter the email address you use when contacting Lens &amp; Light photographers. We'll send you a secure, one-time link to view all your enquiries and continue your conversations.</p>
          <form onSubmit={requestLink} style={{display:"grid",gap:12,marginTop:20}}>
            <label style={{display:"grid",gap:6,fontSize:12,fontWeight:700}}>Your email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" style={{padding:12,border:"1px solid #d5cec1",borderRadius:4,font:"inherit",fontWeight:400}}/></label>
            {error&&<p role="alert" style={{fontSize:12,color:"#9a3d32"}}>{error}</p>}
            <button type="submit" disabled={busy} style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8,padding:12,border:0,borderRadius:4,background:"#292821",color:"#fff",fontSize:13,cursor:"pointer"}}><Mail size={15}/>{busy?"Sending secure link…":"Email me a portal link"}</button>
          </form>
          <p style={{fontSize:11,color:"#81796d",marginTop:16}}>No password or account registration required. Your private session lasts up to 30 days.</p>
        </>}
        <div style={{borderTop:"1px solid #e8e2d8",marginTop:24,paddingTop:16,display:"flex",gap:8,alignItems:"center",fontSize:11,color:"#82796c"}}><LockKeyhole size={14}/>Secure private access · <Link href="/contact" style={{color:"#78654d"}}>Need help?</Link></div>
      </section>
      <p style={{fontSize:11,color:"#81796d",marginTop:18}}><ArrowLeft size={13} style={{display:"inline",verticalAlign:"middle"}}/> <Link href="/" style={{color:"#78654d"}}>Back to Lens &amp; Light</Link></p>
    </div>
  </main>;
}
