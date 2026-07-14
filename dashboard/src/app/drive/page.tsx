"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { 
  Navigation, 
  Volume2, 
  VolumeX, 
  Play, 
  Pause, 
  Sliders, 
  MapPin, 
  RotateCcw, 
  ShieldAlert, 
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Info,
  Compass,
  AlertCircle,
  Sun,
  Moon
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Simulated path checkpoints around Bangalore's NH-48 & HSR Layout sector
const SIMULATED_PATH = [
  { lat: 12.9116, lng: 77.6436, name: "HSR Layout Sector 4 (Residential)", limit: 30, speed: 25, heading: 320 },
  { lat: 12.9135, lng: 77.6412, name: "HSR 19th Main Road (Secondary)", limit: 40, speed: 38, heading: 310 },
  { lat: 12.9160, lng: 77.6375, name: "Outer Ring Road Slip Road", limit: 50, speed: 48, heading: 300 },
  { lat: 12.9185, lng: 77.6358, name: "Outer Ring Road (Trunk)", limit: 60, speed: 68, heading: 330 }, // CAUTION: Speed > 10%
  { lat: 12.9215, lng: 77.6342, name: "Outer Ring Road (Trunk)", limit: 60, speed: 78, heading: 330 }, // DANGER: Speed > 25%
  { lat: 12.9250, lng: 77.6300, name: "Sarjapur Road Underpass (Trunk)", limit: 60, speed: 52, heading: 300 },
  { lat: 12.9295, lng: 77.6258, name: "Hosur Road Connector", limit: 60, speed: 35, heading: 290 }, // Sudden braking simulation (52 -> 35)
  { lat: 12.9325, lng: 77.6215, name: "Hosur Road Flyover (Motorway)", limit: 80, speed: 75, heading: 320 },
  { lat: 12.9355, lng: 77.6185, name: "Hosur Road Flyover (Motorway)", limit: 80, speed: 104, heading: 320 }, // DANGER: Speed > 25%
  { lat: 12.9380, lng: 77.6150, name: "Madiwala Circle (Primary)", limit: 50, speed: 45, heading: 300 },
];

export default function DriveModePage() {
  const router = useRouter();

  // SSR Hydration Safety check
  const [mounted, setMounted] = useState(false);

  // Leaflet map hooks
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const pathLineRef = useRef<any>(null);
  const trailLineRef = useRef<any>(null);

  // States
  const [showWarningScreen, setShowWarningScreen] = useState(true);
  const [useLiveGPS, setUseLiveGPS] = useState(false);
  const [followMe, setFollowMe] = useState(true);
  const [latitude, setLatitude] = useState(SIMULATED_PATH[0].lat);
  const [longitude, setLongitude] = useState(SIMULATED_PATH[0].lng);
  const [speed, setSpeed] = useState(SIMULATED_PATH[0].speed);
  const [prevSpeed, setPrevSpeed] = useState(SIMULATED_PATH[0].speed);
  const [heading, setHeading] = useState(SIMULATED_PATH[0].heading);
  const [speedLimit, setSpeedLimit] = useState(SIMULATED_PATH[0].limit);
  const [roadName, setRoadName] = useState(SIMULATED_PATH[0].name);
  const [highwayType, setHighwayType] = useState("residential");
  const [limitSource, setLimitSource] = useState<"OSM SIGN" | "CLASS EST" | "SIMULATED">("SIMULATED");
  
  // Danger Engine Flags
  const [harshBrakingDetected, setHarshBrakingDetected] = useState(false);
  const [nearbyIncident, setNearbyIncident] = useState<any | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [activeIncidents, setActiveIncidents] = useState<any[]>([]);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [overpassLoading, setOverpassLoading] = useState(false);
  
  // Controls
  const [isSimulating, setIsSimulating] = useState(false);
  const [simIndex, setSimIndex] = useState(0);
  const [manualSpeedMode, setManualSpeedMode] = useState(false);
  const [manualSpeed, setManualSpeed] = useState(35);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [visitedPoints, setVisitedPoints] = useState<[number, number][]>([]);

  // Cooldown timers for voice speech synthesizer to avoid spamming the user
  const voiceCooldownRef = useRef<Record<string, number>>({});
  const lastStateRef = useRef<string>("");
  const wakeLockRef = useRef<any>(null);
  const prevRoadNameRef = useRef<string>("");
  const lastGpsCoordsRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const speedHistoryRef = useRef<number[]>([]);

  // Dynamically verify Leaflet script loading state and setup background triggers
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ((window as any).L) {
      setLeafletLoaded(true);
    } else {
      const checkL = setInterval(() => {
        if ((window as any).L) {
          setLeafletLoaded(true);
          clearInterval(checkL);
        }
      }, 50);
      setTimeout(() => clearInterval(checkL), 3000);
    }

    // Fetch active incidents from backend on load
    fetchActiveIncidents();
    const interval = setInterval(fetchActiveIncidents, 10000); // refresh incidents every 10s

    setMounted(true);

    return () => {
      clearInterval(interval);
      releaseWakeLock();
    };
  }, []);

  // Screen Wake Lock API handler
  const requestWakeLock = async () => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener("release", () => {
        setWakeLockActive(false);
      });
    } catch (err) {
      console.warn("Screen Wake Lock request failed:", err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Trigger wake lock and live GPS when user proceeds from warning screen
  const startDriveHUD = () => {
    setShowWarningScreen(false);
    setUseLiveGPS(true);
    setLimitSource("CLASS EST");
    setSpeed(0);
    setPrevSpeed(0);
    requestWakeLock();
    speakWarning("hud_start", "Drive HUD started. Live GPS tracking enabled. Scanning road hazards.");

    setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize({ animate: false });
      }
    }, 150);
  };

  // Fetch incidents list from backend to scan for nearby hazards
  const fetchActiveIncidents = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/state`);
      if (res.ok) {
        const data = await res.json();
        if (data.incidents) {
          setActiveIncidents(data.incidents);
        }
      }
    } catch (err) {
      console.warn("Could not connect to backend incidents API, running with offline incidents.");
      // Fallback: Seed a simulated active collision for demonstration
      setActiveIncidents([
        {
          id: "INC-MOCK-COL",
          zone: "Z-06",
          verdict: "CONFIRMED",
          severity: 85,
          priority: "HIGH",
          latitude: 12.9250,
          longitude: 77.6300,
          narrative: "Multi-vehicle collision blocking right lane at Sarjapur Underpass."
        }
      ]);
    }
  };

  // Calculate distance between two coordinates in kilometers using Haversine formula
  const getDistanceKm = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  // Evaluate Danger Engine rules
  const getSafetyMetrics = () => {
    const currentSpeed = Math.round(manualSpeedMode ? manualSpeed : speed);
    const speedDelta = prevSpeed - currentSpeed;
    const isNight = new Date().getHours() >= 20 || new Date().getHours() < 6;

    // 1. Harsh Braking rule (12+ km/h drop in a single tick)
    const harshBraking = speedDelta >= 12;

    // 2. Incident proximity scanning (within 400m)
    let closestIncident = null;
    let minDistance = 999.0;
    for (const inc of activeIncidents) {
      if (inc.latitude && inc.longitude) {
        const dist = getDistanceKm(latitude, longitude, inc.latitude, inc.longitude);
        if (dist <= 0.4 && dist < minDistance) { // within 400 meters
          closestIncident = inc;
          minDistance = dist;
        }
      }
    }

    // 3. Overspeeding calculation
    let overspeedPct = 0;
    if (currentSpeed > speedLimit) {
      overspeedPct = ((currentSpeed - speedLimit) / speedLimit) * 100;
    }

    // Determine state
    let state: "SAFE" | "CAUTION" | "DANGER" = "SAFE";
    let message = "SAFE SPEEDS MAINTAINED";

    if (overspeedPct >= 25 || harshBraking || (isNight && currentSpeed > 75)) {
      state = "DANGER";
      if (harshBraking) message = "HARSH BRAKING DETECTED";
      else if (isNight && currentSpeed > 75) message = "NIGHT SPEED DANGER WARNING";
      else message = "CRITICAL SPEED ALERT";
    } else if (overspeedPct >= 10 || closestIncident) {
      state = "CAUTION";
      if (closestIncident) message = "APPROACHING ACCIDENT ZONE";
      else message = "OVER SPEEDING CAUTION";
    }

    return { state, message, harshBraking, closestIncident, overspeedPct, isNight };
  };

  const { state: status, message: statusMsg, harshBraking, closestIncident, overspeedPct, isNight } = getSafetyMetrics();

  // Speak warning message using SpeechSynthesis with custom cooldown
  const speakWarning = (msgKey: string, text: string) => {
    if (!voiceEnabled || typeof window === "undefined" || !window.speechSynthesis) return;

    const now = Date.now();
    const lastSpoken = voiceCooldownRef.current[msgKey] || 0;
    if (now - lastSpoken < 10000) return; // 10-second cooldown per alert class

    window.speechSynthesis.cancel(); // cancel previous utterances
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    voiceCooldownRef.current[msgKey] = now;
  };

  // Monitor safety triggers and voice audio alerts
  useEffect(() => {
    const currentSpeed = Math.round(manualSpeedMode ? manualSpeed : speed);

    if (harshBraking) {
      speakWarning("harsh_brake", "Harsh braking detected. Slow down smoothly.");
      setHarshBrakingDetected(true);
      const t = setTimeout(() => setHarshBrakingDetected(false), 3000);
      return () => clearTimeout(t);
    }

    if (closestIncident) {
      setNearbyIncident(closestIncident);
      speakWarning("nearby_incident", `Caution. Approach with care. Incident reported ${(getDistanceKm(latitude, longitude, closestIncident.latitude, closestIncident.longitude) * 1000).toFixed(0)} meters ahead.`);
    } else {
      setNearbyIncident(null);
    }

    if (status === "DANGER" && overspeedPct >= 25) {
      speakWarning("danger_speed", `Danger. You are driving at ${currentSpeed} in a ${speedLimit} limit zone. Slow down immediately.`);
    } else if (status === "CAUTION" && overspeedPct >= 10) {
      speakWarning("caution_speed", `Warning. Speed limit is ${speedLimit}. You are over speeding.`);
    } else if (status === "SAFE" && lastStateRef.current !== "SAFE" && lastStateRef.current !== "") {
      speakWarning("safe_speed", "Speed within safe limits.");
    }

    lastStateRef.current = status;
  }, [status, speedLimit, speed, manualSpeed, manualSpeedMode, harshBraking, closestIncident]);

  // Synchronize prevSpeed with speed after calculation to avoid infinite alert loops
  useEffect(() => {
    const timer = setTimeout(() => {
      setPrevSpeed(speed);
    }, 50);
    return () => clearTimeout(timer);
  }, [speed]);

  // Fix Leaflet map sizing issues when the warning modal is dismissed
  useEffect(() => {
    if (!showWarningScreen && mapRef.current) {
      const timer = setTimeout(() => {
        mapRef.current.invalidateSize({ animate: false });
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [showWarningScreen]);

  // Leaflet Map Initializer and Marker position update loop
  useEffect(() => {
    if (!leafletLoaded) return;
    const L = (window as any).L;
    if (!L) return;

    let initTimeout: any;

    const initMap = () => {
      const container = document.getElementById("leaflet-map");
      if (!container) {
        initTimeout = setTimeout(initMap, 50);
        return;
      }

      if (!mapRef.current) {
        // Create Map
        mapRef.current = L.map("leaflet-map", {
          zoomControl: false,
          attributionControl: false,
        }).setView([latitude, longitude], 16);

        // Add CartoDB Dark Matter tiles (sleek dark aesthetic)
        L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
          maxZoom: 20,
        }).addTo(mapRef.current);

        // Create Custom Heading Marker Icon
        const headingIcon = L.divIcon({
          className: "custom-heading-icon",
          html: `
            <div class="relative w-8 h-8 flex items-center justify-center">
              <div class="absolute w-7 h-7 rounded-full bg-[#8be9fd]/20 animate-ping opacity-60"></div>
              <div id="heading-arrow" class="w-6 h-6 flex items-center justify-center transform transition-transform duration-300" style="transform: rotate(${heading}deg);">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#8be9fd" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="filter drop-shadow-[0_0_3px_#8be9fd]">
                  <polygon points="12 2 22 22 12 17 2 22 12 2"></polygon>
                </svg>
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        markerRef.current = L.marker([latitude, longitude], { icon: headingIcon }).addTo(mapRef.current);

        // Draw path checkpoints line
        const pathPoints = SIMULATED_PATH.map(p => [p.lat, p.lng]);
        pathLineRef.current = L.polyline(pathPoints, {
          color: "rgba(98, 114, 164, 0.2)",
          weight: 3,
          dashArray: "4, 6"
        }).addTo(mapRef.current);

        // Create Amber Trail Line for history tracking
        trailLineRef.current = L.polyline([], {
          color: "#ffb86c",
          weight: 4,
          opacity: 0.8,
          lineCap: "round"
        }).addTo(mapRef.current);

        // Force map to recalculate dimensions after DOM insertion
        setTimeout(() => {
          if (mapRef.current) {
            mapRef.current.invalidateSize({ animate: false });
          }
        }, 150);
      } else {
        // Update Marker location
        markerRef.current.setLatLng([latitude, longitude]);
        
        // Rotate heading arrow elements
        const arrowEl = document.getElementById("heading-arrow");
        if (arrowEl) {
          arrowEl.style.transform = `rotate(${heading}deg)`;
        }

        // Add to visited trail points list
        setVisitedPoints((prev) => {
          const next = [...prev, [latitude, longitude] as [number, number]];
          if (trailLineRef.current) {
            trailLineRef.current.setLatLngs(next);
          }
          return next.slice(-200); // keep trail up to 200 points
        });

        // Pan/Follow camera if enabled
        if (followMe) {
          mapRef.current.panTo([latitude, longitude], { animate: true, duration: 0.5 });
        }
      }
    };

    initMap();

    return () => {
      if (initTimeout) clearTimeout(initTimeout);
    };
  }, [leafletLoaded, latitude, longitude, heading, showWarningScreen]);

  // Calculates the shortest distance in kilometers from a coordinate point P to a line segment AB
  const getDistanceToSegmentKm = (pLat: number, pLng: number, aLat: number, aLng: number, bLat: number, bLng: number) => {
    const latConv = 111.3;
    const lngConv = 111.3 * Math.cos(pLat * Math.PI / 180);

    const px = pLng * lngConv;
    const py = pLat * latConv;
    const ax = aLng * lngConv;
    const ay = aLat * latConv;
    const bx = bLng * lngConv;
    const by = bLat * latConv;

    const dx = bx - ax;
    const dy = by - ay;

    if (dx === 0 && dy === 0) {
      return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    }

    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    const clampedT = Math.max(0, Math.min(1, t));
    const projX = ax + clampedT * dx;
    const projY = ay + clampedT * dy;

    return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
  };

  // Query Overpass API dynamically for GPS coordinate speed limits
  const fetchLiveRoadDetails = async (lat: number, lng: number) => {
    setOverpassLoading(true);
    // Request geometry nodes (out geom) for precise map matching
    const query = `[out:json];way(around:40, ${lat}, ${lng})[highway];out geom;`;
    try {
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      if (!res.ok) {
        console.warn("Overpass query failed with status: " + res.status);
        setRoadName("Unknown Terrain Route");
        setSpeedLimit(50);
        setLimitSource("CLASS EST");
        return;
      }
      const data = await res.json();
      
      if (data && data.elements && data.elements.length > 0) {
        const elements = data.elements;
        
        // Find the way physically closest to the vehicle using geometry nodes projection
        let closestWay = null;
        let minDistanceToRoad = 999.0;
        
        for (const el of elements) {
          if (el.tags && el.geometry && el.geometry.length >= 2) {
            let wayMinDist = 999.0;
            for (let i = 0; i < el.geometry.length - 1; i++) {
              const dist = getDistanceToSegmentKm(
                lat, lng,
                el.geometry[i].lat, el.geometry[i].lon,
                el.geometry[i+1].lat, el.geometry[i+1].lon
              );
              if (dist < wayMinDist) {
                wayMinDist = dist;
              }
            }
            if (wayMinDist < minDistanceToRoad) {
              minDistanceToRoad = wayMinDist;
              closestWay = el;
            }
          }
        }
        
        // Tag-based search fallback
        if (!closestWay) {
          closestWay = elements.find((el: any) => el.tags?.maxspeed);
          if (!closestWay) closestWay = elements.find((el: any) => el.tags?.highway);
        }

        if (closestWay && closestWay.tags) {
          const name = closestWay.tags.name || closestWay.tags.ref || "Unnamed Road";
          const highway = closestWay.tags.highway || "unknown";
          setRoadName(name);
          setHighwayType(highway);
          
          let currentLimit = 50;
          let sourceVal: "OSM SIGN" | "CLASS EST" = "CLASS EST";

          if (closestWay.tags.maxspeed) {
            const limitVal = parseInt(closestWay.tags.maxspeed);
            if (!isNaN(limitVal)) {
              currentLimit = limitVal;
              sourceVal = "OSM SIGN";
            }
          } else {
            // Apply standard Indian road speed limit heuristics
            if (highway === "motorway") currentLimit = 100;
            else if (highway === "trunk") currentLimit = 80;
            else if (highway === "primary") currentLimit = 60;
            else if (highway === "secondary") currentLimit = 50;
            else if (highway === "tertiary") currentLimit = 40;
            else if (highway === "residential" || highway === "living_street") currentLimit = 30;
          }

          setSpeedLimit(currentLimit);
          setLimitSource(sourceVal);

          // Vocalize location details when changing roads
          if (prevRoadNameRef.current !== name) {
            const limitDesc = sourceVal === "OSM SIGN" 
              ? `Speed limit is ${currentLimit} kilometers per hour.`
              : `Speed limit is estimated at ${currentLimit} kilometers per hour for this road class.`;
            speakWarning("road_change", `Entered ${name}. ${limitDesc}`);
            prevRoadNameRef.current = name;
          }
        }
      } else {
        // No roads found near coords
        setRoadName("Unknown Terrain Route");
        setSpeedLimit(50);
        setLimitSource("CLASS EST");
      }
    } catch (err) {
      console.warn("Overpass speed limit fetch error:", err);
      // Fallback quietly
    } finally {
      setOverpassLoading(false);
    }
  };

  // Simulation Runner Loop
  useEffect(() => {
    if (!isSimulating) return;

    const interval = setInterval(() => {
      setSimIndex((prevIndex) => {
        const nextIndex = (prevIndex + 1) % SIMULATED_PATH.length;
        const checkpoint = SIMULATED_PATH[nextIndex];
        
        setLatitude(checkpoint.lat);
        setLongitude(checkpoint.lng);
        setHeading(checkpoint.heading);
        setRoadName(checkpoint.name);
        setSpeedLimit(checkpoint.limit);
        setSpeed(checkpoint.speed);
        setLimitSource("SIMULATED");
        setHighwayType(checkpoint.limit === 80 ? "motorway" : checkpoint.limit === 60 ? "trunk" : "residential");

        // Optionally query Overpass dynamically in parallel to prove real-world integration works!
        if (nextIndex % 3 === 0) {
          fetchLiveRoadDetails(checkpoint.lat, checkpoint.lng);
        }

        return nextIndex;
      });
    }, 4500); // Step every 4.5 seconds

    return () => clearInterval(interval);
  }, [isSimulating, speed, prevSpeed, manualSpeedMode, manualSpeed]);

  // Live GPS Tracking handler
  useEffect(() => {
    if (!useLiveGPS || typeof window === "undefined") return;

    let watchId: number;

    const successCallback = (position: GeolocationPosition) => {
      // Filter out low accuracy updates (>40m) to suppress coordinate jumping noise
      if (position.coords.accuracy !== null && position.coords.accuracy > 40) {
        console.warn(`Low GPS accuracy (${position.coords.accuracy}m). Ignoring coordinate updates to prevent speed spikes.`);
        return;
      }

      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const ts = position.timestamp;

      setLatitude(lat);
      setLongitude(lng);
      setGpsAccuracy(position.coords.accuracy);

      // 1. Heading (compass direction) fallback calculation
      if (position.coords.heading !== null && position.coords.heading !== undefined && !isNaN(position.coords.heading)) {
        setHeading(position.coords.heading);
      } else if (lastGpsCoordsRef.current) {
        const prev = lastGpsCoordsRef.current;
        const dLng = (lng - prev.lng) * Math.PI / 180;
        const lat1Rad = prev.lat * Math.PI / 180;
        const lat2Rad = lat * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        let bearingDeg = Math.atan2(y, x) * 180 / Math.PI;
        bearingDeg = (bearingDeg + 360) % 360;

        // Rotate arrow only if moved more than 5 meters (ignores static noise)
        const dist = getDistanceKm(prev.lat, prev.lng, lat, lng);
        if (dist > 0.005) {
          setHeading(bearingDeg);
        }
      }

      // 2. Velocity (speed) fallback calculation (for browsers without coords.speed API)
      let speedKmH = 0;
      if (position.coords.speed !== null && position.coords.speed !== undefined && position.coords.speed > 0) {
        speedKmH = Math.round(position.coords.speed * 3.6);
      } else if (lastGpsCoordsRef.current) {
        const prev = lastGpsCoordsRef.current;
        const dist = getDistanceKm(prev.lat, prev.lng, lat, lng);
        const timeDiffSec = (ts - prev.ts) / 1000;
        
        if (timeDiffSec > 0.5 && timeDiffSec < 30) {
          const timeDiffHr = timeDiffSec / 3600;
          const calcSpeed = dist / timeDiffHr;
          // Ignore high static coordinate jitter spikes
          if (calcSpeed > 1 && calcSpeed < 150) {
            speedKmH = Math.round(calcSpeed);
          }
        }
      }

      // 3. Low-Pass Moving Average Speed Smoothing Filter
      if (speedHistoryRef.current) {
        speedHistoryRef.current.push(speedKmH);
        if (speedHistoryRef.current.length > 3) {
          speedHistoryRef.current.shift();
        }
        const avg = speedHistoryRef.current.reduce((a, b) => a + b, 0) / speedHistoryRef.current.length;
        speedKmH = Math.round(avg);
      } else {
        speedHistoryRef.current = [speedKmH];
      }

      setSpeed(speedKmH);

      // Save coords for next calculation tick
      lastGpsCoordsRef.current = { lat, lng, ts };

      // Query Overpass for live speed limits
      fetchLiveRoadDetails(lat, lng);
    };

    const errorCallback = (error: GeolocationPositionError) => {
      console.warn("GPS tracking error:", error.message);
    };

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(successCallback, errorCallback, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      });
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [useLiveGPS]);

  // Manual Reset
  const resetSimulation = () => {
    setIsSimulating(false);
    setSimIndex(0);
    const checkpoint = SIMULATED_PATH[0];
    setLatitude(checkpoint.lat);
    setLongitude(checkpoint.lng);
    setHeading(checkpoint.heading);
    setRoadName(checkpoint.name);
    setSpeedLimit(checkpoint.limit);
    setSpeed(checkpoint.speed);
    setPrevSpeed(checkpoint.speed);
    setLimitSource("SIMULATED");
    setVisitedPoints([]);
    setHarshBrakingDetected(false);
    lastStateRef.current = "";
    if (trailLineRef.current) {
      trailLineRef.current.setLatLngs([]);
    }
  };

  const getStatusColor = () => {
    if (status === "SAFE") return "border-[#50fa7b]/30 bg-[#50fa7b]/5 text-[#50fa7b]";
    if (status === "CAUTION") return "border-[#ffb86c]/30 bg-[#ffb86c]/5 text-[#ffb86c]";
    return "border-[#ff5555]/30 bg-[#ff5555]/5 text-[#ff5555] animate-pulse";
  };

  const getStatusIcon = () => {
    if (status === "SAFE") return <CheckCircle className="w-5 h-5 text-[#50fa7b]" />;
    if (status === "CAUTION") return <AlertTriangle className="w-5 h-5 text-[#ffb86c]" />;
    return <ShieldAlert className="w-5 h-5 text-[#ff5555]" />;
  };

  const displaySpeed = Math.round(manualSpeedMode ? manualSpeed : speed);

  // Hydration safety gate
  if (!mounted) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0f] flex flex-col items-center justify-center font-mono text-xs text-[#bd93f9]">
        <div className="w-5 h-5 border-2 border-[#bd93f9] border-t-transparent rounded-full animate-spin mb-3.5" />
        <span>INITIALIZING RADAR HUD COCKPIT...</span>
      </div>
    );
  }

  // Warning screen rendering (judges notice responsible design)
  if (showWarningScreen) {
    return (
      <div className="h-screen w-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-6 text-center font-mono">
        <div className="absolute inset-0 bg-[radial-gradient(rgba(189,147,249,0.03)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

        <div className="max-w-[420px] bg-[#0f101a] border border-white/5 p-6 rounded-xl flex flex-col items-center gap-4.5 shadow-xl relative z-10">
          <div className="w-12 h-12 rounded-full bg-[#ffb86c]/10 border border-[#ffb86c]/30 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-[#ffb86c] animate-pulse" />
          </div>

          <h2 className="text-sm font-bold tracking-widest text-[#bd93f9] uppercase">
            SAFETY RESPONSIBILITY PROTOCOL
          </h2>

          <div className="text-xs text-[#6272a4] space-y-3 text-left leading-relaxed">
            <p>
              ⚠️ **DO NOT OPERATE** this device while active driving is in progress. Lock the smartphone securely in a windshield mount before startup.
            </p>
            <p>
              🔒 Sentinel requires **HTTPS** for real-time mobile GPS streaming. Local host queries run on device fallback modes.
            </p>
            <p>
              🎙️ **Voice synthesis warnings** are turned on by default. Keep audio enabled to hear active hazard alerts.
            </p>
          </div>

          <div className="flex gap-2 w-full mt-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/")}
              className="flex-1 w-full text-[10px] text-[#6272a4] font-bold border border-white/5 h-10 cursor-pointer"
            >
              CANCEL
            </Button>
            <Button onClick={startDriveHUD} className="flex-1 bg-[#bd93f9] hover:bg-[#bd93f9]/80 text-[#0a0a0f] font-bold text-[10px] h-10 cursor-pointer">
              MOUNTED & READY
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#0a0a0f] flex flex-col font-mono text-white overflow-hidden p-3 relative">
      {/* Dynamic style tag for custom markers */}
      <style dangerouslySetInnerHTML={{ __html: `
        .custom-heading-icon {
          background: transparent !important;
          border: none !important;
        }
        .custom-pulse-icon {
          background: transparent !important;
          border: none !important;
        }
      ` }} />

      {/* Header Bar */}
      <header className="flex items-center justify-between border border-white/5 bg-[#0f101a] p-3 rounded-lg mb-3 shadow-md">
        <div className="flex items-center gap-2">
          <Link href="/" className="p-1 hover:bg-white/5 rounded text-[#6272a4] hover:text-white transition cursor-pointer">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-black tracking-widest text-[#bd93f9] uppercase">
                Sentinel Drive
              </h1>
              <span className="text-[7.5px] uppercase font-bold text-[#ffb86c] border border-[#ffb86c]/30 px-1 rounded tracking-wider">
                COCKPIT HUD v1.2
              </span>
            </div>
            <p className="text-[9px] text-[#6272a4] mt-0.5">
              Danger Engine & Emergency Patrol HUD
            </p>
          </div>
        </div>

        {/* HUD control toggles */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={`h-7 px-2.5 text-[10px] border font-bold cursor-pointer rounded transition flex items-center gap-1 ${
              voiceEnabled 
                ? "bg-[#bd93f9]/15 border-[#bd93f9]/30 text-[#bd93f9] hover:bg-[#bd93f9]/25" 
                : "bg-transparent border-white/10 text-[#6272a4] hover:bg-white/5"
            }`}
          >
            {voiceEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            {voiceEnabled ? "VOICE ON" : "MUTED"}
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setUseLiveGPS(!useLiveGPS);
              setIsSimulating(false);
              setLimitSource(useLiveGPS ? "SIMULATED" : "OSM SIGN");
              lastGpsCoordsRef.current = null;
            }}
            className={`h-7 px-2.5 text-[10px] border font-bold cursor-pointer rounded transition flex items-center gap-1 ${
              useLiveGPS 
                ? "bg-[#50fa7b]/15 border-[#50fa7b]/30 text-[#50fa7b] hover:bg-[#50fa7b]/25" 
                : "bg-transparent border-white/10 text-[#6272a4] hover:bg-white/5"
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            {useLiveGPS ? "GPS ACTIVE" : "ENABLE GPS"}
          </Button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <div className="flex-grow grid grid-cols-12 gap-3 min-h-0">
        {/* Left Side: Large Speedometer HUD & Controls */}
        <div className="col-span-12 md:col-span-6 flex flex-col gap-3 min-h-0">
          
          {/* Danger Engine Warning Banner */}
          <div className={`border p-3.5 rounded-lg flex items-center justify-between shadow-md transition-all duration-300 ${getStatusColor()}`}>
            <div className="flex items-center gap-2.5">
              {getStatusIcon()}
              <div>
                <div className="text-[12px] font-bold tracking-wider leading-none uppercase">
                  {statusMsg}
                </div>
                <div className="text-[8px] opacity-75 mt-1 font-mono uppercase">
                  {roadName} · limit: {speedLimit} km/h · speed: {displaySpeed} km/h
                </div>
              </div>
            </div>
            
            <span className={`text-[10px] font-bold border px-2 py-0.5 rounded tracking-widest ${
              status === "SAFE" ? "border-[#50fa7b] text-[#50fa7b]" :
              status === "CAUTION" ? "border-[#ffb86c] text-[#ffb86c]" : "border-[#ff5555] text-[#ff5555]"
            }`}>
              {status}
            </span>
          </div>

          {/* Large Speedometer Gauge Display */}
          <Card className="bg-[#0f101a] border-white/5 flex-grow flex flex-col justify-center items-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(rgba(189,147,249,0.03)_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

            {/* Circular Speedometer */}
            <div className="relative w-[210px] h-[210px] flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="105"
                  cy="105"
                  r="88"
                  className="stroke-[#1e1f29]"
                  strokeWidth="8"
                  fill="transparent"
                />
                <circle
                  cx="105"
                  cy="105"
                  r="88"
                  className={`transition-all duration-500 ${
                    status === "SAFE" ? "stroke-[#50fa7b]" :
                    status === "CAUTION" ? "stroke-[#ffb86c]" : "stroke-[#ff5555]"
                  }`}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - Math.min(displaySpeed, 120) / 120)}
                  strokeLinecap="round"
                  style={{
                    filter: `drop-shadow(0 0 6px ${
                      status === "SAFE" ? "#50fa7b" : status === "CAUTION" ? "#ffb86c" : "#ff5555"
                    })`
                  }}
                />
              </svg>

              {/* Centered Digital Numbers */}
              <div className="absolute flex flex-col items-center justify-center">
                <span className="text-[54px] font-black tracking-tighter leading-none font-mono">
                  {displaySpeed}
                </span>
                <span className="text-[9px] tracking-widest text-[#6272a4] font-bold uppercase mt-1">
                  KM/H
                </span>
              </div>
            </div>

            {/* Warning engine flags info bar */}
            <div className="grid grid-cols-3 gap-2 w-full mt-4 text-[8px] text-[#6272a4] border-t border-white/5 pt-3.5 select-none">
              <div className={`flex items-center justify-center gap-1 p-1 border rounded ${harshBrakingDetected ? "border-[#ff5555] text-[#ff5555]" : "border-white/5"}`}>
                <AlertTriangle className="w-3 h-3" />
                BRAKING WARN
              </div>
              <div className={`flex items-center justify-center gap-1 p-1 border rounded ${nearbyIncident ? "border-[#ffb86c] text-[#ffb86c] animate-pulse" : "border-white/5"}`}>
                <AlertCircle className="w-3 h-3" />
                COLLISION ZONE
              </div>
              <div className={`flex items-center justify-center gap-1 p-1 border rounded ${isNight ? "border-[#8be9fd] text-[#8be9fd]" : "border-white/5"}`}>
                {isNight ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                NIGHT MODE
              </div>
            </div>

            {/* Speeds Side-by-Side Status */}
            <div className="flex gap-8 mt-4.5 w-full justify-between border-t border-white/5 pt-3">
              <div className="flex flex-col items-center">
                <span className="text-[9px] text-[#6272a4] uppercase font-bold tracking-wider">SPEED LIMIT</span>
                <div className="flex items-center gap-1 mt-1">
                  <div className="w-5.5 h-5.5 rounded-full border-2 border-red-600 bg-white flex items-center justify-center text-[9px] font-black text-black font-sans leading-none">
                    {speedLimit}
                  </div>
                  <span className="text-[11px] font-bold">{speedLimit} km/h</span>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[9px] text-[#6272a4] uppercase font-bold tracking-wider">LIMIT SOURCE</span>
                <span className={`text-[9.5px] font-bold mt-1.5 border px-1.5 rounded ${
                  limitSource === "OSM SIGN" ? "border-[#8be9fd]/30 text-[#8be9fd]" : "border-[#ff79c6]/30 text-[#ff79c6]"
                }`}>
                  {limitSource}
                </span>
              </div>

              <div className="flex flex-col items-center">
                <span className="text-[9px] text-[#6272a4] uppercase font-bold tracking-wider">WAKE LOCK</span>
                <span className={`text-[9.5px] font-bold mt-1.5 border px-1.5 rounded ${
                  wakeLockActive ? "border-[#50fa7b]/30 text-[#50fa7b]" : "border-[#6272a4]/30 text-[#6272a4]"
                }`}>
                  {wakeLockActive ? "ACTIVE" : "OFF"}
                </span>
              </div>
            </div>
          </Card>

          {/* Simulator & Custom Controls Panel */}
          <Card className="bg-[#0f101a] border-white/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="text-xs font-bold text-[#bd93f9] tracking-wider uppercase flex items-center gap-1">
                <Sliders className="w-3.5 h-3.5" />
                Jury Stage Control Deck
              </span>
              {overpassLoading && (
                <div className="flex items-center gap-1 animate-pulse">
                  <div className="w-2 h-2 border border-[#8be9fd] border-t-transparent rounded-full animate-spin" />
                  <span className="text-[8px] text-[#8be9fd]">OSM INTERPRETER...</span>
                </div>
              )}
            </div>

            {/* Mode Controls */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!isSimulating) {
                    setUseLiveGPS(false);
                    setLimitSource("SIMULATED");
                  }
                  setIsSimulating(!isSimulating);
                }}
                className={`h-8 px-3 font-mono text-[10px] font-bold cursor-pointer rounded flex items-center gap-1 ${
                  isSimulating 
                    ? "bg-[#ff5555]/15 border border-[#ff5555]/30 text-[#ff5555]" 
                    : "bg-[#50fa7b]/15 border border-[#50fa7b]/30 text-[#50fa7b]"
                }`}
              >
                {isSimulating ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                {isSimulating ? "PAUSE SIM" : "SIMULATE A DRIVE"}
              </Button>

              <Button
                size="sm"
                onClick={() => {
                  setUseLiveGPS(false);
                  resetSimulation();
                }}
                className="h-8 px-3 bg-transparent border border-white/10 hover:bg-white/5 font-mono text-[10px] font-bold text-[#6272a4] hover:text-white cursor-pointer rounded flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                RESET
              </Button>

              <Button
                size="sm"
                onClick={() => setManualSpeedMode(!manualSpeedMode)}
                className={`h-8 px-3 font-mono text-[10px] font-bold cursor-pointer rounded flex items-center gap-1 ${
                  manualSpeedMode 
                    ? "bg-[#ffb86c]/15 border border-[#ffb86c]/30 text-[#ffb86c]" 
                    : "bg-transparent border border-white/10 text-[#6272a4] hover:bg-white/5"
                }`}
              >
                {manualSpeedMode ? "DISABLE DIAL" : "MANUAL SPEED OVERRIDE"}
              </Button>
            </div>

            {/* Override Slider */}
            {manualSpeedMode && (
              <div className="flex flex-col gap-1.5 p-2 rounded bg-white/[0.01] border border-white/5">
                <div className="flex items-center justify-between text-[9px] text-[#6272a4] font-bold">
                  <span>MANUAL OVERRIDE DIAL</span>
                  <span className="text-[#ffb86c]">{manualSpeed} KM/H</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="120"
                  value={manualSpeed}
                  onChange={(e) => {
                    setManualSpeed(parseInt(e.target.value));
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#ffb86c]"
                />
              </div>
            )}

            {/* Proximity alert details */}
            {nearbyIncident && (
              <div className="bg-[#ff5555]/10 border border-[#ff5555]/20 p-2.5 rounded text-[9px] text-[#ff5555] flex flex-col gap-1">
                <span className="font-bold uppercase tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  COGNITIVE HAZARD DETECTION
                </span>
                <p className="opacity-90">
                  Sentinel Alert: Collision confirmed at **{nearbyIncident.zone}** ({(getDistanceKm(latitude, longitude, nearbyIncident.latitude, nearbyIncident.longitude) * 1000).toFixed(0)}m ahead). Narrative: "{nearbyIncident.narrative}"
                </p>
              </div>
            )}

          </Card>
        </div>

        {/* Right Side: Map Navigation */}
        <div className="col-span-12 md:col-span-6 flex flex-col min-h-0 bg-[#0f101a] border border-white/5 rounded-lg overflow-hidden">
          {/* Map Header */}
          <div className="p-3 bg-black/20 border-b border-white/5 flex items-center justify-between">
            <span className="text-[10px] text-[#bd93f9] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-[#bd93f9]" />
              Road Telematics Monitor
            </span>
            
            {/* Follow me map option */}
            <Button
              size="sm"
              onClick={() => setFollowMe(!followMe)}
              className={`h-5.5 px-2 text-[8px] font-bold border cursor-pointer rounded ${
                followMe ? "bg-[#8be9fd]/15 border-[#8be9fd]/30 text-[#8be9fd]" : "bg-transparent border-white/5 text-[#6272a4]"
              }`}
            >
              FOLLOW CAMERA
            </Button>
          </div>

          {/* Live Road details banner overlay */}
          <div className="p-3 bg-white/[0.01] border-b border-white/5 flex justify-between text-[9px]">
            <div className="flex flex-col">
              <span className="text-[#6272a4] uppercase font-bold tracking-wider">ROAD PATH</span>
              <span className="text-[#8be9fd] font-bold mt-0.5">{roadName}</span>
            </div>
            
            <div className="flex flex-col items-end">
              <span className="text-[#6272a4] uppercase font-bold tracking-wider">ROAD CLASS</span>
              <span className="text-[#ff79c6] font-bold uppercase mt-0.5">
                {highwayType}
              </span>
            </div>
          </div>

          {/* Leaflet Map Div */}
          <div className="w-full h-[500px] bg-[#0a0a0f] flex items-center justify-center relative rounded-b-lg overflow-hidden border-t border-white/5">
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            {!leafletLoaded ? (
              <div className="flex flex-col items-center gap-2 text-[#6272a4] text-xs">
                <div className="w-4 h-4 border-2 border-[#bd93f9] border-t-transparent rounded-full animate-spin" />
                <span>LOADING MAP INTERFACE LAYER...</span>
              </div>
            ) : (
              <div id="leaflet-map" className="absolute inset-0 z-10 w-full h-full" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
